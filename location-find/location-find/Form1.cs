using System.Text.Json;
using Windows.Devices.WiFi;

namespace location_find
{
    public partial class Form1 : Form
    {
        const int SamplesPerSave = 3;
        const double ThresholdDb = 12;

        static readonly string PlacesFile = Path.Combine(AppContext.BaseDirectory, "places.json");
        static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
        const string NoAccessMsg = "Acesso ao Wi-Fi negado. Ative a localização do Windows em Configurações > Privacidade e segurança > Localização (inclusive \"Permitir que aplicativos da área de trabalho acessem sua localização\").";

        List<Sample> samples = new();
        string? currentArea;
        double areaW, areaH;
        (double X, double Y)? estimate;

        public Form1()
        {
            InitializeComponent();
            if (File.Exists(PlacesFile))
            {
                try { samples = JsonSerializer.Deserialize<List<Sample>>(File.ReadAllText(PlacesFile)) ?? new(); }
                catch (Exception ex) { lblStatus.Text = "Erro ao ler places.json: " + ex.Message; }
            }
            RebuildButtons();
            txtNome.TextChanged += (_, _) => SyncArea();
            numLargura.ValueChanged += (_, _) => SyncArea();
            numAltura.ValueChanged += (_, _) => SyncArea();
            SyncArea();
        }

        void SyncArea()
        {
            var n = txtNome.Text.Trim();
            currentArea = n.Length == 0 ? null : n;
            areaW = (double)numLargura.Value;
            areaH = (double)numAltura.Value;
            estimate = null;
            areaPanel.Invalidate();
        }

        // Selects a place with X/Y points as current area (size = max X/Y of its points).
        bool SelectArea(string name)
        {
            var pts = samples.Where(s => s.Name == name && s.X != null && s.Y != null).ToList();
            if (pts.Count == 0) return false;
            txtNome.Text = name; // fires SyncArea
            numLargura.Value = (decimal)Math.Clamp(pts.Max(s => s.X!.Value), 1, 200);
            numAltura.Value = (decimal)Math.Clamp(pts.Max(s => s.Y!.Value), 1, 200);
            return true;
        }

        void SaveFile() => File.WriteAllText(PlacesFile, JsonSerializer.Serialize(samples, Json));

        // Access/adapter problems surface as InvalidOperationException; handlers show ex.Message.
        internal static async Task<List<Reading>> ScanAsync()
        {
            if (await WiFiAdapter.RequestAccessAsync() != WiFiAccessStatus.Allowed)
                throw new InvalidOperationException(NoAccessMsg);
            return await WlanScanner.ScanAsync();
        }

        void SetBusy(bool busy) => btnSalvar.Enabled = btnLocalizar.Enabled = areaPanel.Enabled = !busy;

        void RebuildButtons()
        {
            placesPanel.Controls.Clear();
            foreach (var g in samples.GroupBy(s => s.Name).OrderBy(g => g.Key))
            {
                var btn = new Button
                {
                    Size = new Size(200, 47),
                    Text = $"{g.Key}\n({g.Count()} amostras)",
                    Tag = g.Key,
                    UseVisualStyleBackColor = true,
                };
                var menu = new ContextMenuStrip();
                menu.Items.Add("Excluir lugar", null, (_, _) => DeletePlace(g.Key));
                btn.ContextMenuStrip = menu;
                btn.Click += (_, _) => SelectArea(g.Key);
                placesPanel.Controls.Add(btn);
            }
        }

        void DeletePlace(string name)
        {
            if (MessageBox.Show($"Excluir o lugar '{name}' e todas as suas amostras?", "Excluir lugar",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            samples.RemoveAll(s => s.Name == name);
            SaveFile();
            RebuildButtons();
            lblStatus.Text = $"Lugar '{name}' excluído";
        }

        async Task SaveSamplesAsync(string name, double? x, double? y)
        {
            SetBusy(true);
            try
            {
                var added = new List<Sample>();
                for (int i = 1; i <= SamplesPerSave; i++)
                {
                    lblStatus.Text = $"Escaneando (~4s)... ({i}/{SamplesPerSave})";
                    added.Add(new Sample(name, DateTime.Now, await ScanAsync(), x, y));
                }
                samples.AddRange(added);
                SaveFile();
                RebuildButtons();
                if (x == null) txtNome.Clear();
                lblStatus.Text = x == null
                    ? $"Salvo '{name}' ({SamplesPerSave} amostras, {added.Max(s => s.Readings.Count)} APs)"
                    : $"Gravado ponto ({x:0.0}; {y:0.0}) de '{name}'";
            }
            catch (Exception ex) { lblStatus.Text = ex.Message; }
            finally { SetBusy(false); }
        }

        async void btnSalvar_Click(object? sender, EventArgs e)
        {
            var name = txtNome.Text.Trim();
            if (name.Length == 0) { lblStatus.Text = "Informe o nome do lugar."; return; }
            await SaveSamplesAsync(name, null, null);
        }

        // Meters -> pixels for the drawing (uniform scale, 20px margin); null when no area.
        (float ox, float oy, float k)? AreaScale()
        {
            if (currentArea == null) return null;
            const int M = 30; // room for corner labels
            float k = (float)Math.Min((areaPanel.ClientSize.Width - 2 * M) / areaW, (areaPanel.ClientSize.Height - 2 * M) / areaH);
            if (k <= 0) return null;
            return (M, M, k);
        }

        async void areaPanel_MouseClick(object? sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            if (currentArea == null || AreaScale() is not var (ox, oy, k)) { lblStatus.Text = "Informe o nome da área"; return; }
            double x = Math.Clamp((e.X - ox) / k, 0, areaW), y = Math.Clamp((e.Y - oy) / k, 0, areaH);
            double tol = 0.15 * Math.Sqrt(areaW * areaW + areaH * areaH);
            (double X, double Y)[] snaps = [(0, 0), (areaW, 0), (areaW, areaH), (0, areaH), (areaW / 2, areaH / 2)];
            var near = snaps.OrderBy(p => Math.Pow(p.X - x, 2) + Math.Pow(p.Y - y, 2)).First();
            if (Math.Sqrt(Math.Pow(near.X - x, 2) + Math.Pow(near.Y - y, 2)) <= tol) (x, y) = near;
            await SaveSamplesAsync(currentArea, Math.Round(x, 1), Math.Round(y, 1));
            areaPanel.Invalidate();
        }

        void areaPanel_Paint(object? sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            if (AreaScale() is not var (ox, oy, k))
            {
                TextRenderer.DrawText(g, "Nenhuma área selecionada", Font, areaPanel.ClientRectangle, Color.Gray,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            PointF P(double x, double y) => new(ox + (float)x * k, oy + (float)y * k);
            var tl = P(0, 0); var br = P(areaW, areaH);
            g.DrawRectangle(Pens.Black, tl.X, tl.Y, br.X - tl.X, br.Y - tl.Y);
            string F(double v) => v.ToString("0.#");
            // Corner ids: green = already recorded, gray = pending.
            var recorded = samples.Where(s => s.Name == currentArea && s.X != null).Select(s => (s.X!.Value, s.Y!.Value)).ToHashSet();
            using var bold = new Font(Font.FontFamily, 11, FontStyle.Bold);
            void Corner(string id, double x, double y, float dx, float dy)
            {
                var c = P(x, y);
                var brush = recorded.Contains((Math.Round(x, 1), Math.Round(y, 1))) ? Brushes.ForestGreen : Brushes.Gray;
                g.DrawString($"{id} ({F(x)}; {F(y)})", bold, brush, c.X + dx, c.Y + dy);
            }
            Corner("A", 0, 0, 0, -22);
            Corner("B", areaW, 0, -90, -22);
            Corner("C", areaW, areaH, -90, 4);
            Corner("D", 0, areaH, 0, 4);
            Corner("Centro", areaW / 2, areaH / 2, -45, 10);
            foreach (var p in samples.Where(s => s.Name == currentArea && s.X != null && s.Y != null)
                         .GroupBy(s => (X: s.X!.Value, Y: s.Y!.Value)))
            {
                var c = P(p.Key.X, p.Key.Y);
                g.FillEllipse(Brushes.RoyalBlue, c.X - 6, c.Y - 6, 12, 12);
                g.DrawString(p.Count().ToString(), Font, Brushes.Black, c.X + 7, c.Y - 7);
            }
            if (estimate is var (ex, ey))
            {
                var c = P(ex, ey);
                g.FillEllipse(Brushes.Red, c.X - 8, c.Y - 8, 16, 16);
            }
        }

        async void btnLocalizar_Click(object? sender, EventArgs e)
        {
            SetBusy(true);
            try
            {
                lblStatus.Text = "Escaneando (~4s)...";
                var query = await ScanAsync();
                var rank = Matcher.Rank(query, samples);
                foreach (Button c in placesPanel.Controls) c.UseVisualStyleBackColor = true;
                estimate = null;
                areaPanel.Invalidate();
                if (rank.Count == 0) { lblStatus.Text = "Lugar não mapeado"; return; }

                var top = rank[0];
                bool sure = top.Dist < ThresholdDb;
                var btn = placesPanel.Controls.Cast<Button>().First(b => (string?)b.Tag == top.Name);
                btn.BackColor = sure ? Color.LimeGreen : Color.Khaki;
                lblStatus.Text = $"{(sure ? "Você está em" : "Talvez")} {top.Name} (dist {top.Dist:0.0} dB, {top.Common} APs em comum)";
                if (SelectArea(top.Name))
                {
                    estimate = Matcher.EstimatePosition(query, samples.Where(s => s.Name == top.Name));
                    if (estimate is var (x, y)) lblStatus.Text += $" — posição ≈ ({x:0.0}; {y:0.0}) m";
                    areaPanel.Invalidate();
                }
            }
            catch (Exception ex) { lblStatus.Text = ex.Message; }
            finally { SetBusy(false); }
        }
    }
}
