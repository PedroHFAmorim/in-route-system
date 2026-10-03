package expo.modules.wifiscan

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
  }
}
