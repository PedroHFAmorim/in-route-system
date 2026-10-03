namespace location_find
{
    partial class Form1
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            txtNome = new TextBox();
            btnSalvar = new Button();
            label1 = new Label();
            btnLocalizar = new Button();
            lblStatus = new Label();
            placesPanel = new FlowLayoutPanel();
            lblLargura = new Label();
            numLargura = new NumericUpDown();
            lblAltura = new Label();
            numAltura = new NumericUpDown();
            areaPanel = new DoubleBufferedPanel();
            lblAreaHelp = new Label();
            ((System.ComponentModel.ISupportInitialize)numLargura).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numAltura).BeginInit();
            SuspendLayout();
            //
            // txtNome
            //
            txtNome.Location = new Point(24, 27);
            txtNome.Name = "txtNome";
            txtNome.Size = new Size(303, 23);
            txtNome.TabIndex = 2;
            //
            // btnSalvar
            //
            btnSalvar.Location = new Point(333, 27);
            btnSalvar.Name = "btnSalvar";
            btnSalvar.Size = new Size(116, 23);
            btnSalvar.TabIndex = 3;
            btnSalvar.Text = "Salvar Lugar";
            btnSalvar.UseVisualStyleBackColor = true;
            btnSalvar.Click += btnSalvar_Click;
            //
            // label1
            //
            label1.AutoSize = true;
            label1.Location = new Point(24, 9);
            label1.Name = "label1";
            label1.Size = new Size(87, 15);
            label1.TabIndex = 4;
            label1.Text = "Nome do lugar";
            //
            // btnLocalizar
            //
            btnLocalizar.Location = new Point(543, 54);
            btnLocalizar.Name = "btnLocalizar";
            btnLocalizar.Size = new Size(116, 42);
            btnLocalizar.TabIndex = 5;
            btnLocalizar.Text = "Localizar";
            btnLocalizar.UseVisualStyleBackColor = true;
            btnLocalizar.Click += btnLocalizar_Click;
            //
            // lblStatus
            //
            lblStatus.AutoSize = true;
            lblStatus.Location = new Point(24, 60);
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(0, 15);
            lblStatus.TabIndex = 6;
            //
            // placesPanel
            //
            placesPanel.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left;
            placesPanel.AutoScroll = true;
            placesPanel.Location = new Point(24, 110);
            placesPanel.Name = "placesPanel";
            placesPanel.Size = new Size(560, 540);
            placesPanel.TabIndex = 7;
            //
            // lblLargura
            //
            lblLargura.AutoSize = true;
            lblLargura.Location = new Point(700, 9);
            lblLargura.Name = "lblLargura";
            lblLargura.Size = new Size(68, 15);
            lblLargura.TabIndex = 8;
            lblLargura.Text = "Largura (m)";
            //
            // numLargura
            //
            numLargura.DecimalPlaces = 1;
            numLargura.Location = new Point(700, 27);
            numLargura.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
            numLargura.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numLargura.Name = "numLargura";
            numLargura.Size = new Size(80, 23);
            numLargura.TabIndex = 9;
            numLargura.Value = new decimal(new int[] { 4, 0, 0, 0 });
            //
            // lblAltura
            //
            lblAltura.AutoSize = true;
            lblAltura.Location = new Point(800, 9);
            lblAltura.Name = "lblAltura";
            lblAltura.Size = new Size(64, 15);
            lblAltura.TabIndex = 10;
            lblAltura.Text = "Altura (m)";
            //
            // numAltura
            //
            numAltura.DecimalPlaces = 1;
            numAltura.Location = new Point(800, 27);
            numAltura.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
            numAltura.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numAltura.Name = "numAltura";
            numAltura.Size = new Size(80, 23);
            numAltura.TabIndex = 11;
            numAltura.Value = new decimal(new int[] { 3, 0, 0, 0 });
            //
            // lblAreaHelp
            //
            lblAreaHelp.Location = new Point(700, 54);
            lblAreaHelp.Name = "lblAreaHelp";
            lblAreaHelp.Size = new Size(504, 45);
            lblAreaHelp.TabIndex = 12;
            lblAreaHelp.Text = "Digite o nome, informe largura/altura, vá até um canto e clique nele no desenho para gravar. Grave os 4 cantos (e o centro, opcional).";
            //
            // areaPanel
            //
            areaPanel.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            areaPanel.BackColor = Color.White;
            areaPanel.BorderStyle = BorderStyle.FixedSingle;
            areaPanel.Location = new Point(700, 110);
            areaPanel.Name = "areaPanel";
            areaPanel.Size = new Size(504, 540);
            areaPanel.TabIndex = 13;
            areaPanel.Paint += areaPanel_Paint;
            areaPanel.MouseClick += areaPanel_MouseClick;
            //
            // Form1
            //
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1228, 665);
            Controls.Add(areaPanel);
            Controls.Add(lblAreaHelp);
            Controls.Add(numAltura);
            Controls.Add(lblAltura);
            Controls.Add(numLargura);
            Controls.Add(lblLargura);
            Controls.Add(placesPanel);
            Controls.Add(lblStatus);
            Controls.Add(btnLocalizar);
            Controls.Add(label1);
            Controls.Add(btnSalvar);
            Controls.Add(txtNome);
            Name = "Form1";
            Text = "Location Find";
            ((System.ComponentModel.ISupportInitialize)numLargura).EndInit();
            ((System.ComponentModel.ISupportInitialize)numAltura).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox txtNome;
        private Button btnSalvar;
        private Label label1;
        private Button btnLocalizar;
        private Label lblStatus;
        private FlowLayoutPanel placesPanel;
        private Label lblLargura;
        private NumericUpDown numLargura;
        private Label lblAltura;
        private NumericUpDown numAltura;
        private DoubleBufferedPanel areaPanel;
        private Label lblAreaHelp;
    }
}
