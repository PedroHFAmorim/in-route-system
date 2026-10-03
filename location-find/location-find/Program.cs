namespace location_find
{
    internal static class Program
    {
        /// <summary>
        ///  The main entry point for the application.
        /// </summary>
        [STAThread]
        static int Main(string[] args)
        {
            if (args.Contains("--selftest"))
            {
                try { Matcher.SelfTest(); return 0; }
                catch { return 1; }
            }
            // To customize application configuration such as set high DPI settings or default font,
            // see https://aka.ms/applicationconfiguration.
            ApplicationConfiguration.Initialize();
            Application.Run(new Form3()); // troque para Form1 para voltar à tela de lugares
            return 0;
        }
    }
}
