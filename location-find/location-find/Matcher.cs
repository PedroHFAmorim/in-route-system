namespace location_find
{
    public record Reading(string Bssid, string? Ssid, int Rssi);
    public record Sample(string Name, DateTime CreatedAt, List<Reading> Readings, double? X = null, double? Y = null);
    public record Match(string Name, double Dist, int Common);

    public static class Matcher
    {
        public const int MissingRssi = -100;
        public const int MinRssi = -90;

        public static bool Keep(Reading r)
        {
            if (r.Ssid != null && r.Ssid.EndsWith("_nomap", StringComparison.OrdinalIgnoreCase)) return false;
            if ((Convert.ToInt32(r.Bssid.Substring(0, 2), 16) & 0x02) != 0) return false; // locally administered
            return r.Rssi >= MinRssi;
        }

        static Dictionary<string, int> ByBssid(IEnumerable<Reading> rs) =>
            rs.GroupBy(r => r.Bssid).ToDictionary(g => g.Key, g => g.Last().Rssi);

        // RMS distance in dB; null when too few APs in common.
        public static (double Dist, int Common)? Distance(List<Reading> query, Sample s)
        {
            var q = ByBssid(query);
            int need = q.Count == 1 ? 1 : 2;
            var d = ByBssid(s.Readings);
            int common = q.Keys.Count(d.ContainsKey);
            if (common < need) return null;
            var keys = q.Keys.Union(d.Keys).ToList();
            double sum = 0;
            foreach (var k in keys)
            {
                int a = q.GetValueOrDefault(k, MissingRssi), b = d.GetValueOrDefault(k, MissingRssi);
                sum += (a - b) * (a - b);
            }
            return (Math.Sqrt(sum / keys.Count), common);
        }

        // Ranking: one entry per place (min distance over its samples), best first.
        public static List<Match> Rank(List<Reading> query, IEnumerable<Sample> samples)
        {
            var best = new Dictionary<string, Match>();
            foreach (var s in samples)
            {
                if (Distance(query, s) is not var (dist, common)) continue;
                var m = new Match(s.Name, dist, common);
                if (!best.TryGetValue(s.Name, out var cur) || m.Dist < cur.Dist) best[s.Name] = m;
            }
            return best.Values.OrderBy(m => m.Dist).ToList();
        }

        // Weighted mean of the 3 closest mapped points (point distance = min over its samples).
        public static (double X, double Y)? EstimatePosition(List<Reading> query, IEnumerable<Sample> samplesOfOnePlace)
        {
            var pts = samplesOfOnePlace.Where(s => s.X != null && s.Y != null)
                .GroupBy(s => (X: s.X!.Value, Y: s.Y!.Value))
                .Select(g => (g.Key.X, g.Key.Y, D: g.Select(s => Distance(query, s)?.Dist).Where(d => d != null).Min()))
                .Where(p => p.D != null)
                .OrderBy(p => p.D).Take(3).ToList();
            if (pts.Count == 0) return null;
            double sw = 0, sx = 0, sy = 0;
            foreach (var p in pts)
            {
                double w = 1 / (p.D!.Value * p.D.Value + 1);
                sw += w; sx += w * p.X; sy += w * p.Y;
            }
            return (sx / sw, sy / sw);
        }

        static void Check(bool ok, string msg) { if (!ok) throw new Exception("selftest: " + msg); }

        public static void SelfTest()
        {
            Reading R(string b, string s, int r) => new(b, s, r);
            Sample S(string n, params Reading[] rs) => new(n, DateTime.Now, rs.ToList());
            var a = S("A", R("a4:00:00:00:00:01", "w", -40), R("a4:00:00:00:00:02", "w", -80), R("a4:00:00:00:00:03", "w", -70));
            var b = S("B", R("a4:00:00:00:00:01", "w", -80), R("a4:00:00:00:00:02", "w", -40), R("a4:00:00:00:00:03", "w", -70));
            var c = S("C", R("a4:00:00:00:00:01", "w", -60), R("a4:00:00:00:00:02", "w", -60), R("a4:00:00:00:00:09", "w", -50));
            var rank = Rank(a.Readings, [a, b, c]);
            Check(rank[0].Name == "A", "A deveria vir primeiro");
            var none = Rank([R("bb:00:00:00:00:01", "x", -50), R("bb:00:00:00:00:02", "x", -50)], [a, b, c]);
            Check(none.Count == 0, "sem APs em comum nao deveria retornar nada");
            var corners = new (double X, double Y)[] { (0, 0), (4, 0), (4, 3), (0, 3) };
            var area = corners.Select((c, i) => new Sample("Q", DateTime.Now,
                Enumerable.Range(1, 4).Select(n => R($"a4:00:00:00:01:0{n}", "w", n == i + 1 ? -40 : -80)).ToList(), c.X, c.Y)).ToList();
            var est = EstimatePosition(area[2].Readings, area);
            Check(est != null && Math.Abs(est.Value.X - 4) < 1 && Math.Abs(est.Value.Y - 3) < 1, "posicao estimada fora de 1 m");
            Check(Rank(area[2].Readings, area).Count == 1, "rank com X/Y");
            Check(!Keep(R("a4:00:00:00:00:05", "rede_nomap", -50)), "_nomap nao filtrado");
            Check(!Keep(R("02:11:22:33:44:55", "x", -50)), "bssid administrado localmente nao filtrado");
            Check(!Keep(R("a4:00:00:00:00:05", "x", -95)), "rssi fraco nao filtrado");
            Check(Keep(R("a4:00:00:00:00:05", "ok", -50)), "leitura valida foi filtrada");
        }
    }
}
