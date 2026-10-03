# POC: posicionamento indoor por fingerprint de Wi-Fi (Windows PowerShell 5.1, sem dependencias)
param(
    [Parameter(Position = 0)][string]$Command,
    [string]$Name, [Nullable[double]]$X, [Nullable[double]]$Y,
    [int]$Samples = 3, [int]$Interval = 3
)
$ErrorActionPreference = 'Stop'
$MISSING_RSSI = -100; $MIN_RSSI = -90; $THRESHOLD_DB = 12; $K = 3
$PlacesFile = Join-Path $PSScriptRoot 'places.json'

# ---------- WinRT helpers ----------
$script:WinRT = $true
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [void][Windows.Devices.WiFi.WiFiAdapter, Windows.Devices.WiFi, ContentType = WindowsRuntime]
    $script:AsTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
} catch { $script:WinRT = $false }

function Await($op, [type]$type) {
    $t = $script:AsTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$t.Wait(-1); $t.Result
}
function AwaitAction($act) {
    $m = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
    $t = $m.Invoke($null, @($act)); [void]$t.Wait(-1)
}

# ---------- Leitura / filtro ----------
function Test-Keep($r) {
    if ($r.ssid -like '*_nomap') { return $false }
    if (([Convert]::ToInt32($r.bssid.Substring(0, 2), 16) -band 0x02) -ne 0) { return $false }
    return $r.rssi -ge $MIN_RSSI
}

function Get-ScanNetsh {
    Write-Warning 'WinRT indisponivel: usando netsh (dados em cache, menos preciso).'
    $ssid = ''; $bssid = $null; $out = @()
    foreach ($l in (netsh wlan show networks mode=bssid)) {
        if ($l -match '^\s*SSID \d+ :\s*(.*)$') { $ssid = $Matches[1].Trim() }
        elseif ($l -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})') { $bssid = $Matches[1].ToLower() }
        elseif ($bssid -and $l -match '(\d+)%') {
            $out += [pscustomobject]@{ bssid = $bssid; ssid = $ssid; rssi = [int]([int]$Matches[1] / 2 - 100); freq = 0 }
            $bssid = $null
        }
    }
    $out
}

function Get-Scan {
    if (-not $script:WinRT) { return @(Get-ScanNetsh | Where-Object { Test-Keep $_ }) }
    $access = Await ([Windows.Devices.WiFi.WiFiAdapter]::RequestAccessAsync()) ([Windows.Devices.WiFi.WiFiAccessStatus])
    if ($access -ne 'Allowed') {
        Write-Host 'Acesso ao Wi-Fi negado. Ative os servicos de localizacao do Windows em' -ForegroundColor Red
        Write-Host 'Configuracoes > Privacidade > Localizacao (inclusive "Permitir que aplicativos da area de trabalho acessem sua localizacao").' -ForegroundColor Red
        exit 1
    }
    $adapters = Await ([Windows.Devices.WiFi.WiFiAdapter]::FindAllAdaptersAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.WiFi.WiFiAdapter]])
    if ($adapters.Count -eq 0) { Write-Host 'Nenhum adaptador Wi-Fi encontrado.' -ForegroundColor Red; exit 1 }
    $ad = $adapters[0]
    AwaitAction ($ad.ScanAsync())
    $res = foreach ($n in $ad.NetworkReport.AvailableNetworks) {
        [pscustomobject]@{ bssid = $n.Bssid.ToLower(); ssid = $n.Ssid; rssi = [int]$n.NetworkRssiInDecibelMilliwatts
                           freq = [int]($n.ChannelCenterFrequencyInKilohertz / 1000) }
    }
    @($res | Where-Object { Test-Keep $_ })
}

# ---------- Armazenamento ----------
function Get-Places {
    if (-not (Test-Path $PlacesFile)) { return @() }
    $raw = Get-Content $PlacesFile -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    @($raw | ConvertFrom-Json)
}
function Save-Places($p) {
    $p = @($p)
    if ($p.Count -eq 0) { '[]' | Set-Content $PlacesFile -Encoding UTF8 }
    else { ConvertTo-Json -InputObject $p -Depth 5 | Set-Content $PlacesFile -Encoding UTF8 }
}

# ---------- Matching ----------
function Get-Distances($query, $entries) {
    $q = @{}; foreach ($r in $query) { $q[$r.bssid] = $r.rssi }
    $need = if ($q.Count -eq 1) { 1 } else { 2 }
    foreach ($e in $entries) {
        $s = @{}; foreach ($r in $e.readings) { $s[$r.bssid] = $r.rssi }
        $common = @($q.Keys | Where-Object { $s.ContainsKey($_) }).Count
        if ($common -lt $need) { continue }
        $keys = @($q.Keys) + @($s.Keys) | Select-Object -Unique
        $sum = 0.0
        foreach ($k in $keys) {
            $a = if ($q.ContainsKey($k)) { $q[$k] } else { $MISSING_RSSI }
            $b = if ($s.ContainsKey($k)) { $s[$k] } else { $MISSING_RSSI }
            $sum += [math]::Pow($a - $b, 2)
        }
        [pscustomobject]@{ Name = $e.name; Dist = [math]::Sqrt($sum / $keys.Count); Common = $common; Entry = $e }
    }
}
function Get-Ranking($dists) {   # um lugar = menor distancia entre suas amostras
    @($dists | Group-Object Name | ForEach-Object { $_.Group | Sort-Object Dist | Select-Object -First 1 } | Sort-Object Dist)
}
function Get-Position($dists) {
    $top = @($dists | Where-Object { $null -ne $_.Entry.x -and $null -ne $_.Entry.y } | Sort-Object Dist | Select-Object -First $K)
    if ($top.Count -eq 0) { return $null }
    $sw = 0.0; $sx = 0.0; $sy = 0.0
    foreach ($d in $top) { $w = 1 / ($d.Dist + 1); $sw += $w; $sx += $w * $d.Entry.x; $sy += $w * $d.Entry.y }
    [pscustomobject]@{ X = $sx / $sw; Y = $sy / $sw }
}

function Show-Where {
    $q = Get-Scan
    $d = @(Get-Distances $q (Get-Places))
    $rank = @(Get-Ranking $d)
    Write-Host ("{0} APs lidos" -f $q.Count)
    $rank | Select-Object -First 3 | ForEach-Object {
        Write-Host ("  {0,-20} dist {1,5:N1} dB   APs em comum: {2}" -f $_.Name, $_.Dist, $_.Common) }
    if ($rank.Count -eq 0) { Write-Host 'Lugar nao mapeado' -ForegroundColor Yellow; return }
    if ($rank[0].Dist -lt $THRESHOLD_DB) { Write-Host "Voce esta em $($rank[0].Name)" -ForegroundColor Green }
    else { Write-Host "Talvez $($rank[0].Name)" -ForegroundColor Yellow }
    $pos = Get-Position ($d | Where-Object { $_.Name -eq $rank[0].Name })
    if ($pos) { Write-Host ("Posicao estimada: ({0:N1}, {1:N1}) m" -f $pos.X, $pos.Y) }
}

# ---------- Comandos ----------
function Invoke-SelfTest {
    function MkR($b, $s, $r) { [pscustomobject]@{ bssid = $b; ssid = $s; rssi = $r; freq = 2412 } }
    function MkE($n, $x, $y, $rd) { [pscustomobject]@{ name = $n; x = $x; y = $y; readings = $rd } }
    $a = MkE 'A' $null $null @((MkR 'a4:00:00:00:00:01' 'w' (-40)), (MkR 'a4:00:00:00:00:02' 'w' (-80)), (MkR 'a4:00:00:00:00:03' 'w' (-70)))
    $b = MkE 'B' $null $null @((MkR 'a4:00:00:00:00:01' 'w' (-80)), (MkR 'a4:00:00:00:00:02' 'w' (-40)), (MkR 'a4:00:00:00:00:03' 'w' (-70)))
    $c = MkE 'C' 3 4 @((MkR 'a4:00:00:00:00:01' 'w' (-60)), (MkR 'a4:00:00:00:00:02' 'w' (-60)), (MkR 'a4:00:00:00:00:09' 'w' (-50)))
    $rank = @(Get-Ranking @(Get-Distances $a.readings @($a, $b, $c)))
    if ($rank[0].Name -ne 'A') { throw 'selftest: A deveria vir primeiro' }
    $none = @(Get-Distances @((MkR 'bb:00:00:00:00:01' 'x' (-50)), (MkR 'bb:00:00:00:00:02' 'x' (-50))) @($a, $b, $c))
    if ($none.Count -ne 0) { throw 'selftest: sem APs em comum nao deveria retornar nada' }
    if (Test-Keep (MkR 'a4:00:00:00:00:05' 'rede_nomap' (-50))) { throw 'selftest: _nomap nao filtrado' }
    if (Test-Keep (MkR '02:11:22:33:44:55' 'x' (-50))) { throw 'selftest: bssid administrado localmente nao filtrado' }
    if (-not (Test-Keep (MkR 'a4:00:00:00:00:05' 'ok' (-50)))) { throw 'selftest: leitura valida foi filtrada' }
    $p = Get-Position @(Get-Distances $c.readings @($c))
    if ([math]::Abs($p.X - 3) -gt 1e-9 -or [math]::Abs($p.Y - 4) -gt 1e-9) { throw 'selftest: posicao errada' }
    Write-Host 'selftest OK'
}

switch ($Command) {
    'selftest' { Invoke-SelfTest }
    'scan' {
        $s = @(Get-Scan)
        $s | Sort-Object rssi -Descending | Format-Table @{n = 'SSID'; e = { $_.ssid } }, @{n = 'BSSID'; e = { $_.bssid } },
            @{n = 'RSSI'; e = { $_.rssi } }, @{n = 'MHz'; e = { $_.freq } } -AutoSize
        Write-Host "$($s.Count) redes"
    }
    'save' {
        if (-not $Name) { throw 'Informe -Name "Lugar"' }
        $places = @(Get-Places)
        for ($i = 1; $i -le $Samples; $i++) {
            $s = @(Get-Scan)
            $places += [pscustomobject]@{ name = $Name; x = $X; y = $Y; createdAt = (Get-Date).ToString('o'); readings = $s }
            Write-Host "Amostra $i/${Samples}: $($s.Count) APs"
            if ($i -lt $Samples) { Start-Sleep -Seconds 1 }
        }
        Save-Places $places
        Write-Host "Salvo em $PlacesFile"
    }
    'where' { Show-Where }
    'watch' {
        while ($true) { Clear-Host; Write-Host (Get-Date -Format 'HH:mm:ss') '(Ctrl+C para sair)'; Show-Where; Start-Sleep -Seconds $Interval }
    }
    'list' {
        Get-Places | Group-Object name | ForEach-Object {
            $xy = $_.Group | Where-Object { $null -ne $_.x } | Select-Object -First 1
            $pos = if ($xy) { "($($xy.x), $($xy.y))" } else { '-' }
            Write-Host ("{0,-20} {1} amostra(s)  x/y: {2}" -f $_.Name, $_.Count, $pos) }
    }
    'delete' {
        if (-not $Name) { throw 'Informe -Name "Lugar"' }
        $all = @(Get-Places); $keep = @($all | Where-Object { $_.name -ne $Name })
        Save-Places $keep
        Write-Host "Removidas $($all.Count - $keep.Count) amostra(s) de '$Name'"
    }
    default {
        Write-Host @'
Uso: wifi-locate.ps1 <comando> [opcoes]
  scan                         escaneia e lista redes
  save -Name "Sala 3" [-X 0 -Y 0] [-Samples 3]   salva fingerprint do lugar
  where                        diz onde voce esta
  watch [-Interval 3]          repete 'where' continuamente
  list                         lista lugares salvos
  delete -Name "Sala 3"        remove um lugar
  selftest                     teste interno (sem scan)
'@
    }
}
