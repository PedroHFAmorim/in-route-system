using Windows.Devices.Bluetooth.Advertisement;

namespace location_find
{
    // Lista dispositivos BLE próximos com RSSI e distância estimada (mesmo modelo do Form2, p/ comparar com Wi-Fi).
    // Teste: celular com nRF Connect > Advertiser anunciando como beacon; selecione a linha e calibre a 1 m.
    public class Form3 : Form
    {
        const double N = 3.0;               // mesmo expoente do Form2
        const double DefaultRssi1m = -59;   // padrão iBeacon quando o dispositivo não informa
        static readonly TimeSpan AvgWindow = TimeSpan.FromSeconds(2), Forget = TimeSpan.FromSeconds(10);

        class Dev
        {
            public string Name = "";
            public double? Ref1m;      // vindo do anúncio (iBeacon measured power / TxPower)
            public double? Calibrated; // vindo do clique "Calibrar 1 m"
            public readonly List<(DateTime T, short Rssi)> Hits = new();
        }

        readonly Dictionary<ulong, Dev> devs = new();
        readonly BluetoothLEAdvertisementWatcher watcher = new() { ScanningMode = BluetoothLEScanningMode.Active };
        readonly ListView list = new() { View = View.Details, FullRowSelect = true, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 11) };
        readonly TextBox filter = new() { Width = 250, PlaceholderText = "filtrar por nome/endereço" };
        readonly CheckBox onlyNamed = new() { Text = "só com nome", Checked = true, AutoSize = true };
        readonly Button calib = new() { Text = "Calibrar selecionado a 1 m", AutoSize = true };
        readonly Label status = new() { AutoSize = true };
        readonly System.Windows.Forms.Timer timer = new() { Interval = 500 };

        public Form3()
        {
            Text = "Distância Bluetooth (BLE)";
            ClientSize = new Size(1000, 650);
            foreach (var (h, w) in new[] { ("Nome", 220), ("Endereço", 160), ("RSSI (2s)", 90), ("Distância", 100), ("Leituras/s", 90), ("Ref 1 m", 110), ("Visto há", 80) })
                list.Columns.Add(h, w);
            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40, Padding = new Padding(8) };
            top.Controls.AddRange([filter, onlyNamed, calib, status]);
            Controls.Add(list);
            Controls.Add(top);

            calib.Click += (_, _) =>
            {
                if (list.SelectedItems.Count == 0 || list.SelectedItems[0].Tag is not ulong addr || Avg(devs[addr]) is not double a) return;
                devs[addr].Calibrated = a;
            };
            watcher.Received += (_, e) => BeginInvoke(() => OnAdv(e));
            watcher.Stopped += (_, e) => BeginInvoke(() =>
            {
                if (e.Error != Windows.Devices.Bluetooth.BluetoothError.Success)
                    status.Text = $"Scan parou: {e.Error} (Bluetooth ligado?)";
            });
            timer.Tick += (_, _) => Refresh_();
            Shown += (_, _) => { watcher.Start(); timer.Start(); };
            FormClosed += (_, _) => { watcher.Stop(); timer.Dispose(); };
        }

        void OnAdv(BluetoothLEAdvertisementReceivedEventArgs e)
        {
            if (!devs.TryGetValue(e.BluetoothAddress, out var d)) devs[e.BluetoothAddress] = d = new Dev();
            if (!string.IsNullOrEmpty(e.Advertisement.LocalName)) d.Name = e.Advertisement.LocalName;
            if (IBeaconMeasuredPower(e.Advertisement) is sbyte mp) { d.Ref1m = mp; if (d.Name == "") d.Name = "iBeacon"; }
            else if (e.TransmitPowerLevelInDBm is short tx) d.Ref1m = tx - 41; // TxPower é a 0 m; ~41 dB de perda até 1 m
            d.Hits.Add((DateTime.Now, e.RawSignalStrengthInDBm));
        }

        // iBeacon: manufacturer 0x004C, payload 02 15 + UUID(16) + major(2) + minor(2) + measured power(1).
        static sbyte? IBeaconMeasuredPower(BluetoothLEAdvertisement adv)
        {
            foreach (var m in adv.GetManufacturerDataByCompanyId(0x004C))
            {
                var b = new byte[m.Data.Length];
                using (var r = Windows.Storage.Streams.DataReader.FromBuffer(m.Data)) r.ReadBytes(b);
                if (b.Length >= 23 && b[0] == 0x02 && b[1] == 0x15) return (sbyte)b[22];
            }
            return null;
        }

        static double? Avg(Dev d)
        {
            var cut = DateTime.Now - AvgWindow;
            var recent = d.Hits.Where(h => h.T >= cut).ToList();
            return recent.Count == 0 ? null : recent.Average(h => (double)h.Rssi);
        }

        void Refresh_()
        {
            var now = DateTime.Now;
            foreach (var d in devs.Values) d.Hits.RemoveAll(h => now - h.T > Forget);
            foreach (var k in devs.Where(kv => kv.Value.Hits.Count == 0).Select(kv => kv.Key).ToList()) devs.Remove(k);

            ulong? selected = list.SelectedItems.Count > 0 ? list.SelectedItems[0].Tag as ulong? : null;
            var f = filter.Text.Trim();
            list.BeginUpdate();
            list.Items.Clear();
            foreach (var (addr, d) in devs.OrderByDescending(kv => Avg(kv.Value) ?? -200))
            {
                var mac = string.Join(":", BitConverter.GetBytes(addr).Take(6).Reverse().Select(b => b.ToString("x2")));
                if (onlyNamed.Checked && d.Name == "") continue;
                if (f != "" && !d.Name.Contains(f, StringComparison.OrdinalIgnoreCase) && !mac.Contains(f, StringComparison.OrdinalIgnoreCase)) continue;
                var avg = Avg(d);
                double r1 = d.Calibrated ?? d.Ref1m ?? DefaultRssi1m;
                string refSrc = d.Calibrated != null ? "calibrado" : d.Ref1m != null ? "anúncio" : "padrão";
                double rate = d.Hits.Count(h => now - h.T <= AvgWindow) / AvgWindow.TotalSeconds;
                var item = new ListViewItem([
                    d.Name == "" ? "(sem nome)" : d.Name, mac,
                    avg is double a ? $"{a:0} dBm" : "-",
                    avg is double a2 ? $"{Math.Pow(10, (r1 - a2) / (10 * N)):0.0} m" : "-",
                    $"{rate:0.0}", $"{r1:0} ({refSrc})",
                    $"{(now - d.Hits[^1].T).TotalSeconds:0}s"]) { Tag = addr };
                if (addr == selected) item.Selected = true;
                list.Items.Add(item);
            }
            list.EndUpdate();
            if (!status.Text.StartsWith("Scan parou")) status.Text = $"{devs.Count} dispositivos";
        }
    }
}
