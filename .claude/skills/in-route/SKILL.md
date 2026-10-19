---
name: in-route
description: Localização indoor por Wi-Fi/Bluetooth do projeto In-Route (POC Windows em WinForms "location-find", script PowerShell, editor web Vue em "web" e app Android Expo em "mobile"; desenvolvimento agora em Linux, com build Android local e depuração Wi-Fi). Use ao mexer em scan de Wi-Fi/BLE, fingerprint/matching de lugares, estimativa de distância/posição, build do app mobile ou ao depurar leituras erradas. Documenta o que já foi validado em campo, as armadilhas já descobertas (cache de scan, throttling do Android, Expo Go) e offsets nativos verificados — pra não redescobrir.
---

# In-Route: o que já aprendemos

Plano do produto: [.claude/HANDOFF.md](../../HANDOFF.md). Pedido original: [.claude/TASK.md](../../TASK.md).
Regra do usuário: planejar com Opus; explorar e escrever código com agentes **Sonnet**.

## Mapa do repo

| Pasta | O que é | Status |
|---|---|---|
| `poc-windows/wifi-locate.ps1` | 1º POC, PowerShell 5.1 + WinRT. `scan/save/where/watch/list/delete/selftest` | Superado pelo WinForms; ainda usa WinRT (tem o bug do cache, ver §1). **Só Windows** |
| `location-find/location-find/` | WinForms .NET 10 (`net10.0-windows10.0.19041.0`) | Principal POC desktop. **Só Windows** (não compila/roda no Linux) |
| ├ `Form1` | Salvar lugar (botão por lugar) + Localizar (verde/amarelo) + calibração de área por cantos | **Validado em campo** (andares de prédio) |
| ├ `Form2` | Rede conectada + distância estimada a cada 1 s (clique a 1 m = calibra) | Lê certo (conferido com `netsh`); precisão em campo não reportada |
| ├ `Form3` | Lista BLE com RSSI/distância, ~10 leituras/s | Scan funciona (14 dispositivos/5 s); comparação com Wi-Fi não reportada |
| ├ `Matcher.cs` / `WlanScanner.cs` | Matching puro + scan nativo `wlanapi.dll` | `--selftest` cobre o Matcher |
| └ `Program.cs` | Escolhe o form em `Application.Run(new FormN())`; `--selftest` → exit code | |
| `web/` | Vite + Vue 3 + Bootstrap 5. Editor de mapas: lugar → andares → blocos em grade (mesmo formato `Block`/`PlaceMap` do mobile), planta de fundo para decalcar. Salva em `localStorage` (`inroute-web:v1`) + exportar/importar JSON | Testado no navegador (pintar, pincel, planta). Roda no Linux (build ok em 2026-10-19). `npm run dev`; `node --experimental-strip-types src/grid.check.ts` → "grid OK" |
| `mobile/` | Expo SDK 57 / RN 0.86, Android-only, módulo nativo local `modules/wifi-scan` (Kotlin) | Instalado via APK do EAS e rodando no celular do usuário. `tsc`/`matcher OK` no Linux; build Android local no Linux ainda não executado |

## 1. Cache de scan: a armadilha nº 1 (já custou um dia de teste)

**Sintoma:** em prédio, no 10º andar o app dizia "Talvez 7"; no 7º dizia "Térreo".
**Causa (provada no `places.json`):** o SO devolve APs vistos minutos atrás com o **RSSI congelado**. O "Térreo" foi salvo com as leituras **idênticas, dBm por dBm**, da última amostra do 7º (gravada 73 s antes).
**Regra:** todo scan descarta leituras anteriores ao início do scan.
- Windows: WinRT `WiFiAdapter.NetworkReport` **não tem "visto em"**, então não serve. Use `wlanapi.dll` (`WlanScan`, espera 4 s, `WlanGetNetworkBssList`, filtro `ullHostTimestamp >= início - 1 s`).
- Android: `ScanResult.timestamp` (µs desde o boot) `>= SystemClock.elapsedRealtimeNanos()/1000` do início. Já está em `WifiScanModule.kt`.
- Depois da correção, o usuário reportou que "funcionou muito melhor".

## 2. Matching (fingerprint), comum a todas as plataformas

- Leitura = BSSID (MAC do rádio do AP) + RSSI. **O SSID não identifica nada**: vários APs têm o mesmo nome.
- Filtro (`Keep`): descartar SSID `*_nomap`, BSSID com bit *locally administered* (`primeiro_octeto & 0x02`, ou seja, hotspot ou MAC aleatório) e RSSI < -90.
  - Nos dados de teste, não usar BSSID começando com `aa:`, porque `0xaa` tem esse bit ligado e o filtro descarta.
- Distância = RMS das diferenças de RSSI na **união** dos BSSIDs, com ausente = -100. Exige ≥ 2 APs em comum (1 se a consulta só tem 1).
- Lugar = menor distância entre suas amostras. `< 12 dB` → "Você está em X" (verde); senão "Talvez X" (amarelo).
- Andares vizinhos compartilham muitos APs (7º × 8º: 55 em comum), mas a força do sinal separa. **Várias amostras por lugar** ajudam.
- Posição dentro de uma área (cantos com X/Y): média ponderada dos K=3 pontos mais próximos, `w = 1/(d²+1)`. Fica sempre dentro do contorno dos cantos. Precisão esperada de 2 a 4 m; 5×5 m está no limite.

## 3. Windows: detalhes nativos verificados

- **WLAN_BSS_ENTRY** (360 bytes; a lista começa no offset 8 de WLAN_BSS_LIST): SSID len @0, SSID @4, BSSID @40, `lRssi` @56, `ullHostTimestamp` @80 (FILETIME UTC), `ulChCenterFrequency` @92 (kHz). Validado: idade de cerca de 3 s após espera de 4 s.
- **Rede conectada sem scan**, que pode ser lida a cada 1 s: `WlanQueryInterface` opcode 7 (`current_connection`), com SSID len @520, SSID @524 e BSSID @560; e opcode `0x10000102` (`rssi`), que devolve um LONG em dBm. `5023` = não conectado. Conferido idêntico ao `netsh wlan show interfaces`.
- Exige **Localização do Windows ligada**, inclusive "apps da área de trabalho". `WiFiAdapter.RequestAccessAsync()` é chamado antes, para validar.
- O scan leva cerca de 4 s, então não existe localização por scan a cada 1 s no Windows. O Form1/Form2 de cantos fazia ~5 s por ciclo. Melhoria possível: `WlanRegisterNotification` (scan_complete) em vez da espera fixa.

## 4. Distância por RSSI (Form2/Form3)

- Modelo log-distância: `d = 10^((RSSI_1m - RSSI) / (10·N))`, com `N = 3` (subir para 3,5–4 com muitas paredes; ~2 em ambiente aberto).
- **Calibrar a 1 m** (o clique grava o RSSI médio). Sem calibrar: -40 dBm no Wi-Fi e -59 no BLE (padrão iBeacon), ou o `measured power` do iBeacon / `TxPower - 41`.
- Média móvel: 5 leituras (Wi-Fi) ou janela de 2 s (BLE). Parede custa 5 a 15 dB e o corpo também atrapalha.

## 5. Bluetooth (BLE)

- No Windows: `BluetoothLEAdvertisementWatcher` com `ScanningMode = Active`. O evento chega em outra thread, então use `BeginInvoke`.
- Real no notebook: 14 dispositivos e 56 anúncios em 5 s, **quase todos sem nome e sem TxPower** (endereços aleatórios de celulares). O Form3 vem com "só com nome" marcado.
- Para testar: **nRF Connect > Advertiser** no celular, com "Complete Local Name".
- A vantagem do BLE não é a física, que é a mesma faixa de 2,4 GHz. São os emissores em posição conhecida, as ~10 leituras/s, o **funcionamento no iPhone (iBeacon)** e a **ausência de throttling**. Precisão real exige BT 5.1 AoA, BT 6.0 Channel Sounding ou UWB.

## 6. Android / app mobile

- **Expo Go não carrega o módulo nativo.** O erro é `Cannot find native module 'WifiScan'` em tela vermelha. Instalar o **APK do EAS** e abrir o ícone In-Route. `index.ts` usa `requireOptionalNativeModule` e mostra a mensagem no status em vez de travar.
- **Build local + depuração Wi-Fi.** Fluxo (igual nos dois SOs, a partir de `mobile/`): `npx expo prebuild -p android --no-install`, `cd android && ./gradlew assembleDebug` (1º build ~9 min), `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8081 tcp:8081`, `npx expo start`. Mudou só JS → só recarregar; mudou Kotlin → rebuild. O APK de debug tem outra assinatura que o do EAS: precisa desinstalar o outro antes (`adb uninstall com.inroute.app`).
  - **JDK tem que ser o 17.** O JDK 25 (o `jbr` do Android Studio) quebra `configureCMakeDebug` ("A restricted method in java.lang.System").
  - **Linux (máquina principal desde 2026-10-19, Ubuntu 26.04):** JDK 17 do apt (`openjdk-17-jdk`, `/usr/lib/jvm/java-17-openjdk-amd64`, é o único Java). SDK sem Android Studio em `~/Android/Sdk`, via `cmdline-tools/latest/bin/sdkmanager`: `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1` (as versões que o RN 0.86 pede em `node_modules/react-native/gradle/libs.versions.toml`). `JAVA_HOME`, `ANDROID_HOME` e o `PATH` estão **no topo** do `~/.bashrc`: abaixo do `case $- in *i*` o Ubuntu dá `return` em shell não interativo, e as variáveis não chegariam ao Bash do Claude nem a scripts. Se `adb` não for encontrado: `export PATH=$PATH:$HOME/Android/Sdk/platform-tools`. `sudo` pede senha, então instalação via apt quem roda é o usuário (`! sudo apt ...`).
  - **Windows (até 2026-10-16):** SDK em `%LOCALAPPDATA%\Android\Sdk`; JDK 17 portátil em `%LOCALAPPDATA%\jdk17\jdk-17.0.20.1+1` (o Adoptium do PATH é 8).
  - **Celular (Galaxy A02, SM-A022M, Android 11 / API 30), depuração por Wi-Fi:** cada PC tem a própria chave adb, então máquina nova precisa **parear**. `adb mdns services` mostra o `_adb-tls-connect` (192.168.0.4:porta) mesmo sem pareamento, mas `adb connect` falha. No celular: Depuração por Wi-Fi > "Parear dispositivo com código"; o usuário passa IP:porta de pareamento e o código; `adb pair <ip>:<porta> <código>`. Depois disso o adb reconecta sozinho pelo mDNS (aparece como `adb-RX8RC0C6BQW-..._adb-tls-connect._tcp`). Se também der `adb connect <ip>:<porta>`, o aparelho aparece duas vezes e `adb shell` reclama de "more than one device": use `adb disconnect <ip>:<porta>` ou `-s`. Linux pareado em 2026-10-19; a limitação de scan já estava em `0` e o `com.inroute.app` já instalado.
- Build na nuvem (EAS), alternativa: `cd mobile && npx eas-cli build -p android --profile preview` (gera APK; o perfil está em `eas.json`). O Kotlin só compila lá; se o build falhar, o log do EAS diz o motivo.
- **Throttling: 4 scans a cada 2 min em foreground** (Android 9+), contando Salvar e Localizar juntos.
  - O loop automático de 2 s **não é viável** com a limitação ligada. Ele foi trocado pelo botão **Localizar**, e o **Salvar faz 1 scan** (salvar de novo com o mesmo nome = mais uma amostra).
  - Quando há throttling, `startScan()` retorna `false`. O módulo resolve na hora com `throttled: true`, sem esperar os 8 s.
  - **Para depurar, desligue a limitação:** Opções do desenvolvedor > Redes > "Limitação de busca por Wi-Fi", ou `adb shell settings put global wifi_scan_throttle_enabled 0` (conferir com `get` → `0`). A Play Store não muda nada; a limitação vale para todo app.
  - **Na produção, o usuário final terá a limitação ligada.** Combinação planejada: scan completo só ao salvar ou ao suspeitar de mudança de lugar, mais o **RSSI da rede conectada** (sem limite, como no Form2), mais **BLE** (sem limite).
- Permissões: `ACCESS_FINE_LOCATION`, `NEARBY_WIFI_DEVICES` (API 33+), `ACCESS_WIFI_STATE` e `CHANGE_WIFI_STATE`, além da **localização do sistema ligada**; sem ela o scan volta vazio.
- **iOS:** não existe API pública de scan de Wi-Fi. Só o BSSID da rede conectada. O caminho para iOS é BLE/iBeacon.

## Verificação rápida

```bash
# Mobile (de mobile/), roda em Linux e Windows
npm ci                                             # node_modules não vai pro git
npx tsc --noEmit
node --experimental-strip-types matcher.check.ts   # "matcher OK"
npx expo-doctor                                    # em 2026-10-19: só 2 patches desatualizados (expo, expo-location), inofensivo
# Web (de web/)
npm ci
node --experimental-strip-types src/grid.check.ts  # "grid OK"
npm run build
# Ambiente Android (Linux)
java -version            # 17.x
adb devices              # celular como "device"
# WinForms: só no Windows (de location-find/location-find)
dotnet build                     # esperar 0 erros, 0 avisos
./bin/Debug/net10.0-windows10.0.19041.0/location-find.exe --selftest; echo $?   # 0 = ok
```

## Armadilhas do ambiente de desenvolvimento

- **O que não roda no Linux:** `location-find` (WinForms, `net10.0-windows`, `wlanapi.dll`, WinRT) e `poc-windows/*.ps1`. Instalar `dotnet` ou `pwsh` não resolve, porque dependem de API do Windows. Mexer neles só para editar código; testar exige o Windows.
- Linux: Node 22 (via nvm, carregado no `~/.bashrc`). Não há `python` por padrão nos scripts do projeto; continue usando `node` para scripts rápidos.
- Windows: `python` no Git Bash é o stub da Microsoft Store e **trava**. Use `node` para scripts rápidos.
- Ao testar código nativo por um argumento temporário (`--ble`, `--conn`) no `Program.cs`: **confirme que o build passou antes de rodar o exe**. Se o build falhar, o exe antigo abre a janela do formulário na tela do usuário. Depois, restaure o `Program.cs` e apague o arquivo temporário.
- O `places.json` do WinForms fica ao lado do exe (`bin/Debug/...`). Trocar para Release "some" com os lugares.
- PowerShell 5.1: `R` e `rd` são aliases embutidos e sombreiam funções com esses nomes.
- O template do Expo criou `mobile/.claude/settings.json`, que ativa o plugin `expo`. Foi deixado como estava.
