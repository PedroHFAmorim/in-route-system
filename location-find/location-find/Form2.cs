namespace location_find
{
    // Mostra a rede conectada e a distância estimada até o roteador, atualizada a cada 1s.
    // Clicar no botão estando a 1 m do roteador calibra o modelo.
    public partial class Form2 : Form
    {
        // Modelo log-distância: d = 10^((Rssi1m - rssi) / (10 * N)).
        // ponytail: N fixo; em ambiente com muita parede suba para 3.5-4, campo aberto ~2.
        const double N = 3.0;
        double rssi1m = -40; // RSSI típico a 1 m; recalibrado pelo clique
        readonly Queue<int> last = new(); // média móvel das últimas leituras (RSSI oscila ±5 dB)
        const int Window = 5;
        readonly System.Windows.Forms.Timer timer = new() { Interval = 1000 };

        public Form2()
        {
            InitializeComponent();
            Text = "Distância até o Wi-Fi";
            button1.Size = new Size(420, 160);
            button1.Font = new Font(Font.FontFamily, 14);
            button1.Anchor = AnchorStyles.None;
            button1.Location = new Point((ClientSize.Width - button1.Width) / 2, (ClientSize.Height - button1.Height) / 2);
            button1.Text = "Conectando...";
            button1.Click += (_, _) => Calibrate();
            timer.Tick += (_, _) => Tick();
            Shown += async (_, _) =>
            {
                try { await Form1.ScanAsync(); } // pede/valida a permissão de localização do Windows
                catch (Exception ex) { button1.Text = ex.Message; return; }
                Tick();
                timer.Start();
            };
            FormClosed += (_, _) => timer.Dispose();
        }

        void Tick()
        {
            try
            {
                if (WlanScanner.Connected() is not var (ssid, bssid, rssi))
                {
                    last.Clear();
                    button1.Text = "Não conectado a nenhuma rede Wi-Fi";
                    return;
                }
                last.Enqueue(rssi);
                while (last.Count > Window) last.Dequeue();
                double avg = last.Average();
                double d = Math.Pow(10, (rssi1m - avg) / (10 * N));
                button1.Text = $"{ssid}\n{bssid}\n{avg:0} dBm  ≈  {d:0.0} m\n(clique a 1 m do roteador p/ calibrar; ref {rssi1m:0} dBm)";
            }
            catch (Exception ex) { button1.Text = ex.Message; }
        }

        void Calibrate()
        {
            if (last.Count == 0) return;
            rssi1m = last.Average();
        }
    }
}
