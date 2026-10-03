using System.Runtime.InteropServices;
using System.Text;

namespace location_find
{
    // Scan via wlanapi: filters out stale BSS entries the OS keeps cached (WinRT NetworkReport has no "last seen").
    static class WlanScanner
    {
        [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(int clientVersion, IntPtr reserved, out int negotiated, out IntPtr handle);
        [DllImport("wlanapi.dll")] static extern int WlanCloseHandle(IntPtr handle, IntPtr reserved);
        [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr handle, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")] static extern int WlanScan(IntPtr handle, ref Guid iface, IntPtr ssid, IntPtr ie, IntPtr reserved);
        [DllImport("wlanapi.dll")] static extern int WlanGetNetworkBssList(IntPtr handle, ref Guid iface, IntPtr ssid, int bssType, bool secure, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr p);

        const int EntrySize = 360;

        static void Check(int err, string fn)
        {
            if (err != 0) throw new InvalidOperationException($"{fn} falhou (erro {err}).");
        }

        public static async Task<List<Reading>> ScanAsync() =>
            (await ScanDetailedAsync()).Select(e => e.Reading).ToList();

        // Same scan, with extra fields (used by the temporary --scan check).
        internal static async Task<List<(Reading Reading, uint FreqKHz, DateTime Seen)>> ScanDetailedAsync()
        {
            Check(WlanOpenHandle(2, IntPtr.Zero, out _, out var handle), "WlanOpenHandle");
            IntPtr ifList = IntPtr.Zero, bssList = IntPtr.Zero;
            try
            {
                Check(WlanEnumInterfaces(handle, IntPtr.Zero, out ifList), "WlanEnumInterfaces");
                if (Marshal.ReadInt32(ifList, 0) < 1) throw new InvalidOperationException("Nenhum adaptador Wi-Fi encontrado.");
                var guid = new Guid(Read(ifList, 8, 16));

                var scanStart = DateTime.UtcNow;
                Check(WlanScan(handle, ref guid, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero), "WlanScan");
                // ponytail: fixed wait for scan; register WlanRegisterNotification scan_complete if 4s proves too slow/short
                await Task.Delay(4000);

                Check(WlanGetNetworkBssList(handle, ref guid, IntPtr.Zero, 1 /*dot11_BSS_type_infrastructure*/, false, IntPtr.Zero, out bssList), "WlanGetNetworkBssList");
                int n = Marshal.ReadInt32(bssList, 4);
                var all = new List<(Reading, uint, DateTime)>();
                for (int i = 0; i < n; i++)
                {
                    int o = 8 + i * EntrySize;
                    int ssidLen = (int)Math.Min((uint)Marshal.ReadInt32(bssList, o), 32u);
                    var ssid = Encoding.UTF8.GetString(Read(bssList, o + 4, ssidLen));
                    var bssid = string.Join(":", Read(bssList, o + 40, 6).Select(b => b.ToString("x2")));
                    int rssi = Marshal.ReadInt32(bssList, o + 56);
                    if (rssi > 0 || rssi < -127) throw new InvalidOperationException($"RSSI inválido ({rssi}): offsets de WLAN_BSS_ENTRY incorretos.");
                    var seen = DateTime.FromFileTimeUtc(Marshal.ReadInt64(bssList, o + 80));
                    uint freq = (uint)Marshal.ReadInt32(bssList, o + 92);
                    all.Add((new Reading(bssid, ssid, rssi), freq, seen));
                }

                var cutoff = scanStart.AddSeconds(-1);
                var fresh = all.Where(e => e.Item3 >= cutoff && Matcher.Keep(e.Item1)).ToList();
                if (fresh.Count == 0 && all.Count > 0)
                    throw new InvalidOperationException("Scan não retornou leituras novas; tente de novo.");
                return fresh;
            }
            finally
            {
                if (bssList != IntPtr.Zero) WlanFreeMemory(bssList);
                if (ifList != IntPtr.Zero) WlanFreeMemory(ifList);
                WlanCloseHandle(handle, IntPtr.Zero);
            }
        }

        [DllImport("wlanapi.dll")] static extern int WlanQueryInterface(IntPtr handle, ref Guid iface, int opCode, IntPtr reserved, out int size, out IntPtr data, out int valueType);
        const int OpCurrentConnection = 7, OpRssi = 0x10000102, ErrorInvalidState = 5023;

        // Rede conectada + RSSI ao vivo do driver (sem scan, barato p/ chamar a cada 1s). null = desconectado.
        public static (string Ssid, string Bssid, int Rssi)? Connected()
        {
            Check(WlanOpenHandle(2, IntPtr.Zero, out _, out var handle), "WlanOpenHandle");
            IntPtr ifList = IntPtr.Zero, conn = IntPtr.Zero, rssiPtr = IntPtr.Zero;
            try
            {
                Check(WlanEnumInterfaces(handle, IntPtr.Zero, out ifList), "WlanEnumInterfaces");
                if (Marshal.ReadInt32(ifList, 0) < 1) throw new InvalidOperationException("Nenhum adaptador Wi-Fi encontrado.");
                var guid = new Guid(Read(ifList, 8, 16));

                int err = WlanQueryInterface(handle, ref guid, OpCurrentConnection, IntPtr.Zero, out _, out conn, out _);
                if (err == ErrorInvalidState) return null;
                Check(err, "WlanQueryInterface(current_connection)");
                // WLAN_CONNECTION_ATTRIBUTES: wlanAssociationAttributes @520 -> SSID len @520, SSID @524, BSSID @560
                int ssidLen = (int)Math.Min((uint)Marshal.ReadInt32(conn, 520), 32u);
                var ssid = Encoding.UTF8.GetString(Read(conn, 524, ssidLen));
                var bssid = string.Join(":", Read(conn, 560, 6).Select(b => b.ToString("x2")));

                err = WlanQueryInterface(handle, ref guid, OpRssi, IntPtr.Zero, out _, out rssiPtr, out _);
                if (err == ErrorInvalidState) return null;
                Check(err, "WlanQueryInterface(rssi)");
                int rssi = Marshal.ReadInt32(rssiPtr);
                return (ssid, bssid, rssi);
            }
            finally
            {
                if (rssiPtr != IntPtr.Zero) WlanFreeMemory(rssiPtr);
                if (conn != IntPtr.Zero) WlanFreeMemory(conn);
                if (ifList != IntPtr.Zero) WlanFreeMemory(ifList);
                WlanCloseHandle(handle, IntPtr.Zero);
            }
        }

        static byte[] Read(IntPtr p, int offset, int len)
        {
            var b = new byte[len];
            Marshal.Copy(p + offset, b, 0, len);
            return b;
        }
    }
}
