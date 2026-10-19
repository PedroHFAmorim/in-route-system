package expo.modules.wifiscan

import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class WifiScanModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WifiScan")

    AsyncFunction("scan") { promise: Promise ->
      val ctx = appContext.reactContext!!.applicationContext
      val wm = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
      // ScanResult.timestamp is microseconds since boot; older results are cached/stale.
      val startUs = SystemClock.elapsedRealtimeNanos() / 1000
      val handler = Handler(Looper.getMainLooper())
      val done = AtomicBoolean(false)
      var throttled = false
      lateinit var finish: Runnable

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          finish.run()
        }
      }

      finish = Runnable {
        if (!done.compareAndSet(false, true)) return@Runnable
        handler.removeCallbacks(finish)
        try {
          ctx.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
        }
        try {
          val readings = wm.scanResults
            .filter { it.timestamp >= startUs }
            .map {
              mapOf(
                "bssid" to it.BSSID.lowercase(),
                "ssid" to (it.SSID ?: ""),
                "rssi" to it.level,
                "freq" to it.frequency
              )
            }
          promise.resolve(mapOf("throttled" to throttled, "readings" to readings))
        } catch (e: SecurityException) {
          promise.reject("E_PERMISSION", e.message, e)
        } catch (e: Exception) {
          promise.reject("E_SCAN", e.message, e)
        }
      }

      try {
        ContextCompat.registerReceiver(
          ctx,
          receiver,
          IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
          ContextCompat.RECEIVER_EXPORTED
        )
        @Suppress("DEPRECATION")
        val started = wm.startScan()
        if (!started) {
          // Throttled: no fresh broadcast is coming; resolve now (stale results get filtered out).
          throttled = true
          finish.run()
        } else {
          handler.postDelayed(finish, 8000)
        }
      } catch (e: SecurityException) {
        if (done.compareAndSet(false, true)) {
          try {
            ctx.unregisterReceiver(receiver)
          } catch (_: IllegalArgumentException) {
          }
          promise.reject("E_PERMISSION", e.message, e)
        }
      }
    }

    // Currently-connected network: BSSID/SSID/RSSI. Reads live connection state — NOT a scan,
    // so it is NOT throttled and can be polled every second. Returns null when not associated.
    AsyncFunction("connected") { promise: Promise ->
      val ctx = appContext.reactContext!!.applicationContext
      val wm = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
      try {
        @Suppress("DEPRECATION")
        val info = wm.connectionInfo
        val bssid = info?.bssid?.lowercase()
        // Sentinels for "not really connected" / permission or location off:
        if (info == null || bssid == null || bssid == "02:00:00:00:00:00" || bssid == "00:00:00:00:00:00" || info.rssi == -127) {
          promise.resolve(null)
          return@AsyncFunction
        }
        @Suppress("DEPRECATION")
        val ssid = (info.ssid ?: "").trim('"').let { if (it == "<unknown ssid>") "" else it }
        promise.resolve(mapOf("bssid" to bssid, "ssid" to ssid, "rssi" to info.rssi))
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", e.message, e)
      } catch (e: Exception) {
        promise.reject("E_CONN", e.message, e)
      }
    }

    AsyncFunction("bleScan") { ms: Int, promise: Promise ->
      val ctx = appContext.reactContext!!.applicationContext
      val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
      val scanner = try {
        if (adapter?.isEnabled == true) adapter.bluetoothLeScanner else null
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", e.message, e)
        return@AsyncFunction
      }
      if (scanner == null) {
        promise.reject("E_BT_OFF", "Bluetooth desligado", null)
        return@AsyncFunction
      }
      val handler = Handler(Looper.getMainLooper())
      val sums = HashMap<String, IntArray>() // address -> [sum, count]
      val names = HashMap<String, String>()
      val cb = object : ScanCallback() {
        override fun onScanResult(type: Int, r: ScanResult) {
          val id = r.device.address.lowercase()
          val a = sums.getOrPut(id) { IntArray(2) }
          a[0] += r.rssi
          a[1]++
          r.scanRecord?.deviceName?.let { names[id] = it }
        }
      }
      try {
        scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", e.message, e)
        return@AsyncFunction
      }
      handler.postDelayed({
        try {
          scanner.stopScan(cb)
          promise.resolve(sums.map { (id, a) -> mapOf("id" to id, "name" to (names[id] ?: ""), "rssi" to a[0] / a[1]) })
        } catch (e: SecurityException) {
          promise.reject("E_PERMISSION", e.message, e)
        }
      }, ms.toLong())
    }
  }
}
