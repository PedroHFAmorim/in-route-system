package expo.modules.wifiscan

import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class WifiScanModule : Module() {
  // --- estado do receiver passivo (longa duração) ---
  private val passiveLock = Any()
  private var passiveReceiver: BroadcastReceiver? = null
  private var passiveCtx: Context? = null
  private val passiveEvents = AtomicLong(0)
  @Volatile private var lastEventUs: Long = -1L

  private companion object {
    const val PASSIVE_WINDOW_MS = 30_000L
    // Teto de segurança do caminho "throttled": nunca devolver leitura mais velha que isso.
    const val THROTTLED_CAP_MS = 5 * 60_000L

    // BLE: histórico máximo por endereço, teto de endereços/amostras e reinício da sessão.
    const val BLE_HISTORY_MS = 60_000L
    const val BLE_MAX_ADDRS = 500
    const val BLE_MAX_SAMPLES_PER_ADDR = 300
    // O Android rebaixa para "opportunistic" um scan BLE que passa de 30 min sem parar (só recebe
    // resultado se OUTRO app estiver escaneando). Por isso paramos e reabrimos antes disso.
    const val BLE_RESTART_MS = 25 * 60_000L
    // Limite do sistema: 5 startScan por 30 s. Retentativa preguiçosa no snapshot respeita isso.
    const val BLE_RETRY_MIN_MS = 6_000L
  }

  // --- estado do observador da rede conectada ---
  private val connLock = Any()
  private var connCtx: Context? = null
  private var connCm: ConnectivityManager? = null
  private var connCallback: ConnectivityManager.NetworkCallback? = null
  private var connRssiReceiver: BroadcastReceiver? = null
  private val connEmitLock = Any()
  private var lastConnKey: String? = "init" // "init" = nada emitido ainda; null = última emissão foi "sem rede"

  // Mesmos descartes do connected(): devolve null se não for uma conexão real.
  private fun connMap(bssidRaw: String?, ssidRaw: String?, rssi: Int): Map<String, Any>? {
    val bssid = bssidRaw?.lowercase()
    if (bssid == null || bssid == "02:00:00:00:00:00" || bssid == "00:00:00:00:00:00" || rssi == -127) return null
    val ssid = (ssidRaw ?: "").trim('"').let { if (it == "<unknown ssid>") "" else it }
    return mapOf("bssid" to bssid, "ssid" to ssid, "rssi" to rssi)
  }

  // Emite só quando BSSID ou RSSI mudam (as duas fontes podem disparar juntas).
  private fun emitConn(c: Map<String, Any>?) {
    synchronized(connEmitLock) {
      val key = if (c == null) null else "${c["bssid"]}|${c["rssi"]}"
      if (key == lastConnKey) return
      lastConnKey = key
      sendEvent("onConn", mapOf("conn" to c))
    }
  }

  private fun emitFromWifiInfo(info: WifiInfo?) {
    @Suppress("DEPRECATION")
    emitConn(if (info == null) null else connMap(info.bssid, info.ssid, info.rssi))
  }

  private inner class ConnCb : ConnectivityManager.NetworkCallback {
    constructor() : super()

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.S)
    constructor(flags: Int) : super(flags)

    override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
      try {
        val ti = caps.transportInfo
        if (ti is WifiInfo) emitFromWifiInfo(ti)
      } catch (_: Exception) {
      }
    }

    override fun onLost(network: Network) {
      emitConn(null)
    }
  }

  private fun stopConnInternal() {
    synchronized(connLock) {
      val ctx = connCtx
      connCallback?.let {
        try { connCm?.unregisterNetworkCallback(it) } catch (_: Exception) {}
      }
      connRssiReceiver?.let {
        try { ctx?.unregisterReceiver(it) } catch (_: IllegalArgumentException) {}
      }
      connCallback = null
      connRssiReceiver = null
      connCm = null
      connCtx = null
    }
    synchronized(connEmitLock) { lastConnKey = "init" }
  }

  // --- estado da sessão BLE contínua ---
  private class BleSample(val t: Long, val rssi: Int)

  private val bleLock = Any()
  private var bleActive = false          // sessão pedida (mesmo que o scan esteja momentaneamente parado)
  private var bleScanning = false        // há um startScan vivo
  private var bleScanner: BluetoothLeScanner? = null
  private var bleCb: ScanCallback? = null
  private var bleCtx: Context? = null
  private var bleLastAttempt = 0L
  private val bleBuf = HashMap<String, ArrayDeque<BleSample>>()
  private val bleNames = HashMap<String, String>()
  private val bleHandler = Handler(Looper.getMainLooper())
  private val bleRestart = object : Runnable {
    override fun run() {
      synchronized(bleLock) {
        if (!bleActive) return
        closeBleScanLocked()
        try { openBleScanLocked() } catch (_: Exception) {}
        bleHandler.postDelayed(this, BLE_RESTART_MS)
      }
    }
  }

  private fun bleNow(): Long = SystemClock.elapsedRealtime()

  // Chamar com bleLock. Devolve null se abriu, ou o código de erro. Pode lançar SecurityException.
  private fun openBleScanLocked(): String? {
    val ctx = bleCtx ?: return "E_BT_OFF"
    bleLastAttempt = bleNow()
    val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    val scanner = if (adapter?.isEnabled == true) adapter.bluetoothLeScanner else null
    if (scanner == null) return "E_BT_OFF"
    val cb = object : ScanCallback() {
      override fun onScanResult(type: Int, r: ScanResult) {
        try {
          val id = r.device.address.lowercase()
          val now = bleNow()
          synchronized(bleLock) {
            if (!bleActive || bleCb !== this) return
            var q = bleBuf[id]
            if (q == null) {
              if (bleBuf.size >= BLE_MAX_ADDRS) pruneBleLocked(now)
              if (bleBuf.size >= BLE_MAX_ADDRS) return
              q = ArrayDeque()
              bleBuf[id] = q
            }
            q.addLast(BleSample(now, r.rssi))
            while (q.size > BLE_MAX_SAMPLES_PER_ADDR || (q.isNotEmpty() && now - q.first().t > BLE_HISTORY_MS)) q.removeFirst()
            r.scanRecord?.deviceName?.let { bleNames[id] = it }
          }
        } catch (_: Exception) {
        }
      }

      override fun onScanFailed(errorCode: Int) {
        synchronized(bleLock) { if (bleCb === this) bleScanning = false }
      }
    }
    scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
    bleScanner = scanner
    bleCb = cb
    bleScanning = true
    return null
  }

  // Chamar com bleLock. Engole erros (BT pode ter sido desligado no meio).
  private fun closeBleScanLocked() {
    val sc = bleScanner
    val cb = bleCb
    if (sc != null && cb != null) {
      try { sc.stopScan(cb) } catch (_: Exception) {}
    }
    bleScanner = null
    bleCb = null
    bleScanning = false
  }

  // Chamar com bleLock: descarta amostras fora do histórico e endereços vazios.
  private fun pruneBleLocked(now: Long) {
    val it = bleBuf.entries.iterator()
    while (it.hasNext()) {
      val e = it.next()
      val q = e.value
      while (q.isNotEmpty() && now - q.first().t > BLE_HISTORY_MS) q.removeFirst()
      if (q.isEmpty()) {
        it.remove()
        bleNames.remove(e.key)
      }
    }
  }

  private fun stopBleInternal() {
    synchronized(bleLock) {
      bleActive = false
      bleHandler.removeCallbacks(bleRestart)
      closeBleScanLocked()
      bleBuf.clear()
      bleNames.clear()
      bleCtx = null
    }
  }

  // "Agora" na mesma base de ScanResult.timestamp (microssegundos desde o boot).
  private fun nowUs(): Long = SystemClock.elapsedRealtimeNanos() / 1000

  // Lê wm.scanResults (cache do sistema, grátis) e mantém SÓ os APs cujo timestamp individual
  // passa em `keep`. Toda leitura sai com ageMs real calculado de ScanResult.timestamp.
  private fun readResults(
    wm: WifiManager,
    nowUs: Long,
    keep: (android.net.wifi.ScanResult) -> Boolean
  ): List<Map<String, Any>> =
    wm.scanResults
      .filter(keep)
      .map {
        mapOf(
          "bssid" to (it.BSSID ?: "").lowercase(),
          "ssid" to (it.SSID ?: ""),
          "rssi" to it.level,
          "freq" to it.frequency,
          "ageMs" to ((nowUs - it.timestamp) / 1000).coerceAtLeast(0L)
        )
      }

  private fun newestAge(readings: List<Map<String, Any>>): Long? =
    readings.minOfOrNull { it["ageMs"] as Long }

  private fun result(readings: List<Map<String, Any>>, source: String, throttled: Boolean): Map<String, Any?> =
    mapOf(
      "readings" to readings,
      "ageMs" to newestAge(readings),
      "source" to source,
      "throttled" to throttled
    )

  private fun stopPassiveInternal() {
    synchronized(passiveLock) {
      val r = passiveReceiver ?: return
      try {
        passiveCtx?.unregisterReceiver(r)
      } catch (_: IllegalArgumentException) {
      }
      passiveReceiver = null
      passiveCtx = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WifiScan")

    Events("onScanResults", "onConn")

    OnDestroy {
      stopPassiveInternal()
      stopConnInternal()
      stopBleInternal()
    }

    AsyncFunction("scan") { maxAgeMs: Int, allowActive: Boolean, timeoutMs: Int, promise: Promise ->
      val ctx = appContext.reactContext!!.applicationContext
      val wm = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val maxAgeUs = maxAgeMs.toLong() * 1000

      // 1) Cache do sistema: grátis, não gasta orçamento de scan. Filtro por timestamp de CADA AP.
      try {
        val now = nowUs()
        val cached = readResults(wm, now) { now - it.timestamp <= maxAgeUs }
        if (cached.isNotEmpty()) {
          promise.resolve(result(cached, "cache", false))
          return@AsyncFunction
        }
        // 2) Nada fresco e scan ativo proibido.
        if (!allowActive) {
          promise.resolve(result(emptyList(), "none", false))
          return@AsyncFunction
        }
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", e.message, e)
        return@AsyncFunction
      } catch (e: Exception) {
        promise.reject("E_SCAN", e.message, e)
        return@AsyncFunction
      }

      // 3) Scan ativo. ScanResult.timestamp é µs desde o boot; resultados mais velhos são cache/stale.
      val startUs = nowUs()
      val handler = Handler(Looper.getMainLooper())
      val done = AtomicBoolean(false)
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
          // Rigor do scan ativo: só o que foi coletado depois do início desta chamada.
          val readings = readResults(wm, nowUs()) { it.timestamp >= startUs }
          promise.resolve(result(readings, "active", false))
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
          // Throttled: nenhum broadcast novo virá. Antes filtrávamos por startUs e isso descartava
          // 100% do conteúdo (sempre lista vazia). Agora devolvemos o cache com as idades REAIS,
          // sem o limite de maxAgeMs (só um teto de segurança de 5 min); o JS decide pela ageMs.
          if (done.compareAndSet(false, true)) {
            try {
              ctx.unregisterReceiver(receiver)
            } catch (_: IllegalArgumentException) {
            }
            try {
              val now = nowUs()
              val capUs = THROTTLED_CAP_MS * 1000
              val readings = readResults(wm, now) { now - it.timestamp <= capUs }
              promise.resolve(result(readings, "cache", true))
            } catch (e: SecurityException) {
              promise.reject("E_PERMISSION", e.message, e)
            } catch (e: Exception) {
              promise.reject("E_SCAN", e.message, e)
            }
          }
        } else {
          handler.postDelayed(finish, timeoutMs.toLong())
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

    // Escuta passiva: o broadcast chega para QUALQUER scan do aparelho (API 29+), sem gastar scan próprio.
    AsyncFunction("startPassive") {
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null) {
        synchronized(passiveLock) {
          if (passiveReceiver == null) {
            val wm = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val receiver = object : BroadcastReceiver() {
              override fun onReceive(c: Context?, intent: Intent?) {
                passiveEvents.incrementAndGet()
                lastEventUs = nowUs()
                try {
                  val now = nowUs()
                  val fresh = readResults(wm, now) { now - it.timestamp <= PASSIVE_WINDOW_MS * 1000 }
                  sendEvent("onScanResults", mapOf("count" to fresh.size, "ageMs" to newestAge(fresh)))
                } catch (_: SecurityException) {
                  // sem permissão de localização: ignora e segue
                } catch (_: Exception) {
                }
              }
            }
            ContextCompat.registerReceiver(
              ctx,
              receiver,
              IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
              ContextCompat.RECEIVER_EXPORTED
            )
            passiveReceiver = receiver
            passiveCtx = ctx
          }
        }
      }
    }

    AsyncFunction("stopPassive") {
      stopPassiveInternal()
    }

    AsyncFunction("passiveStats") {
      val last = lastEventUs
      mapOf(
        "events" to passiveEvents.get().toInt(),
        "lastAgeMs" to (if (last < 0) null else ((nowUs() - last) / 1000).coerceAtLeast(0L))
      )
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

    // Observador contínuo da rede Wi-Fi conectada (RSSI por evento, sem polling e sem limite).
    AsyncFunction("startConnWatch") {
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null) {
        synchronized(connLock) {
          if (connCallback == null && connRssiReceiver == null) {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val wm = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
            connCtx = ctx
            connCm = cm
            try {
              val cb = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                ConnCb(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO) else ConnCb()
              cm.registerNetworkCallback(
                NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),
                cb
              )
              connCallback = cb
            } catch (_: Exception) {
            }
            // Rede de segurança: RSSI_CHANGED_ACTION (deprecada, mas ainda entregue).
            try {
              val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                  try {
                    @Suppress("DEPRECATION")
                    emitFromWifiInfo(wm.connectionInfo)
                  } catch (_: Exception) {
                  }
                }
              }
              @Suppress("DEPRECATION")
              ContextCompat.registerReceiver(ctx, receiver, IntentFilter(WifiManager.RSSI_CHANGED_ACTION), ContextCompat.RECEIVER_EXPORTED)
              connRssiReceiver = receiver
            } catch (_: Exception) {
            }
            // Estado inicial.
            try {
              @Suppress("DEPRECATION")
              emitFromWifiInfo(wm.connectionInfo)
            } catch (_: Exception) {
            }
          }
        }
      }
    }

    AsyncFunction("stopConnWatch") {
      stopConnInternal()
    }

    // Sessão BLE contínua: um único startScan, buffer em memória, snapshot instantâneo.
    AsyncFunction("startBleSession") { promise: Promise ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx == null) {
        promise.reject("E_BT_OFF", "Contexto indisponível", null)
        return@AsyncFunction
      }
      synchronized(bleLock) {
        if (bleActive) {
          promise.resolve(null)
          return@AsyncFunction
        }
        bleCtx = ctx
        try {
          val err = openBleScanLocked()
          if (err != null) {
            bleCtx = null
            promise.reject(err, "Bluetooth desligado", null)
            return@AsyncFunction
          }
        } catch (e: SecurityException) {
          closeBleScanLocked()
          bleCtx = null
          promise.reject("E_PERMISSION", e.message, e)
          return@AsyncFunction
        }
        bleActive = true
        bleHandler.removeCallbacks(bleRestart)
        bleHandler.postDelayed(bleRestart, BLE_RESTART_MS)
      }
      promise.resolve(null)
    }

    AsyncFunction("stopBleSession") {
      stopBleInternal()
    }

    AsyncFunction("bleSnapshot") { windowMs: Int ->
      synchronized(bleLock) {
        if (!bleActive) return@AsyncFunction emptyList<Map<String, Any>>()
        val now = bleNow()
        // Se o scan caiu (BT desligado/religado, falha), tenta reabrir sem estourar 5 startScan/30 s.
        if (!bleScanning && now - bleLastAttempt >= BLE_RETRY_MIN_MS) {
          try { openBleScanLocked() } catch (_: Exception) {}
        }
        pruneBleLocked(now)
        val win = windowMs.toLong().coerceAtMost(BLE_HISTORY_MS)
        bleBuf.mapNotNull { (id, q) ->
          val inWin = q.filter { now - it.t <= win }
          if (inWin.isEmpty()) null
          else mapOf("id" to id, "name" to (bleNames[id] ?: ""), "rssi" to inWin.sumOf { it.rssi } / inWin.size)
        }
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
