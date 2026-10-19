# HANDOFF — In-Route: localização interna por Wi-Fi (MVP)

> Planejado com Opus. Execução: agentes **Sonnet**, uma fase por agente, na ordem abaixo.
> Repo hoje está vazio (só `.claude/`). Monorepo simples: `api/` (NestJS) + `app/` (React Native/Expo).

---

## 1. Objetivo do MVP

Um usuário (anônimo) abre o app, dá um nome a um lugar ("Recepção", "Sala 3", "Caixa 2") e toca em **Salvar**.
O app captura **GPS + scan de redes Wi-Fi (BSSID/RSSI)** e envia ao backend como *fingerprint* daquele lugar.
Depois, o botão **Onde estou?** faz um novo scan e o backend devolve o lugar salvo mais parecido.

App aberto ao público: qualquer pessoa/estabelecimento mapeia e todos consultam a mesma base.

**Fora do MVP (não fazer agora):** login, mapa/planta baixa, rotas entre pontos, hierarquia estabelecimento→andar→sala, moderação, BLE, iOS com scan, painel web.

---

## 2. Restrições técnicas que definem o projeto (ler antes de codar)

| Tema | Realidade | Decisão |
|---|---|---|
| **Scan Wi-Fi no Android** | `WifiManager` entrega BSSID, SSID, RSSI, frequência. Exige `ACCESS_FINE_LOCATION` + localização do sistema ligada; Android 13+ também `NEARBY_WIFI_DEVICES`. **Throttling: 4 scans / 2 min em foreground** (Android 9+); além disso devolve resultado em cache. | MVP é **Android-first**. 1 scan por ação; o usuário pode "adicionar amostra" ao mesmo lugar depois. Guardar `timestamp` do resultado e avisar se o scan veio velho (> 30 s). |
| **Cache de scan (validado no POC Windows)** | O SO devolve APs vistos minutos atrás com RSSI congelado. No POC isso fez o "Térreo" ser salvo com as leituras do 7º andar. | **Descartar todo reading anterior ao início do scan.** Android: `ScanResult.timestamp` (µs desde o boot) comparado com `SystemClock.elapsedRealtime()`. Windows: `ullHostTimestamp` do `WlanGetNetworkBssList`. |
| **Scan Wi-Fi no iOS** | **Não existe API pública** para listar redes ao redor (`NEHotspotHelper` exige entitlement especial da Apple, praticamente nunca concedido). Só dá para ler o **BSSID da rede conectada** (`NEHotspotNetwork.fetchCurrent`, entitlement "Access WiFi Information"). | iOS no MVP: só GPS + BSSID conectado (fingerprint de 1 AP). Funciona mal, deixar explícito na UI. Não bloquear o MVP por isso. |
| **"MAC de dispositivos"** | MAC de celulares/notebooks ao redor **não é capturável** sem root/modo monitor, e é **randomizado** pelos SOs. BLE de celulares também rotaciona endereço (~15 min). | O "MAC" útil e estável é o **BSSID dos access points** — é isso que vamos usar. Não coletar MAC de dispositivos de pessoas (também é dado pessoal → LGPD). BLE de dispositivos fixos (beacons, impressoras, TVs) fica para fase 2. |
| **APs que não servem** | Hotspots de celular se movem; BSSIDs "locally administered" geralmente são randomizados/móveis. Convenção da indústria: SSID terminando em `_nomap` = dono pediu para não mapear. | Filtrar no **app e no backend**: descartar SSID `*_nomap`, BSSID com bit *locally administered* (`primeiro_octeto & 0x02`), e RSSI < -90 dBm. |
| **GPS indoor** | Impreciso (20–100 m) dentro de prédios. | GPS serve só para **contexto grosso** (qual prédio/região) e para descartar candidatos muito longe. Quem decide o lugar é o Wi-Fi. |
| **Google Play** | Uso de localização exige divulgação proeminente + política de privacidade. | Só localização em **foreground**. Tela de consentimento antes do primeiro scan. Política de privacidade simples antes de publicar. |

---

## 3. Stack

- **Backend:** NestJS + Prisma + PostgreSQL (plugin Postgres do Railway). Validação com `class-validator`/`ValidationPipe`, rate limit com `@nestjs/throttler`.
- **App:** React Native via **Expo com development build** (não Expo Go — precisa de módulo nativo).
  - `expo-location` → GPS.
  - `react-native-wifi-reborn` → `reScanAndLoadWifiList()` retorna `{SSID, BSSID, level, frequency, timestamp}`.
    - Se a lib não funcionar com o Expo SDK atual: escrever um **Expo Module local em Kotlin** (~40 linhas) que chama `WifiManager.startScan()` + `getScanResults()`. Não procurar terceira lib.
  - `fetch` puro para a API (sem axios, sem react-query no MVP).
  - Identidade: UUID gerado no primeiro uso e salvo com `expo-secure-store` → header `X-Device-Id`.
- **Infra:** Railway — 1 serviço `api` (build Nixpacks a partir de `api/`) + 1 Postgres. Sem PostGIS (bounding box simples resolve no MVP).

Sem pacote compartilhado entre `api/` e `app/`: o tipo `Reading` é pequeno, duplicar.

---

## 4. Modelo de dados (Prisma)

```prisma
model Place {
  id           String        @id @default(uuid())
  name         String
  lat          Float?
  lng          Float?
  accuracy     Float?        // metros, do GPS
  createdBy    String        // X-Device-Id
  createdAt    DateTime      @default(now())
  fingerprints Fingerprint[]
  @@index([lat, lng])
}

model Fingerprint {
  id        String        @id @default(uuid())
  placeId   String
  place     Place         @relation(fields: [placeId], references: [id], onDelete: Cascade)
  platform  String        // "android" | "ios"
  createdBy String
  createdAt DateTime      @default(now())
  readings  WifiReading[]
}

model WifiReading {
  id            String      @id @default(uuid())
  fingerprintId String
  fingerprint   Fingerprint @relation(fields: [fingerprintId], references: [id], onDelete: Cascade)
  bssid         String      // lowercase "aa:bb:cc:dd:ee:ff"
  ssid          String?
  rssi          Int         // dBm
  frequency     Int?        // MHz
  @@index([bssid])
}
```

`WifiReading` separado (em vez de JSON) para indexar por `bssid` — é o índice que acha candidatos.

---

## 5. API

Todas recebem header `X-Device-Id` (UUID). Body validado com DTO; `readings` com no máx. 100 itens, `bssid` validado por regex `^([0-9a-f]{2}:){5}[0-9a-f]{2}$`, `rssi` entre -120 e 0.

```
POST /places
  { name, lat?, lng?, accuracy?, platform, readings: Reading[] }
  → 201 { id, name, fingerprintCount: 1 }

POST /places/:id/fingerprints        // "adicionar amostra" ao lugar existente
  { platform, readings: Reading[] }
  → 201 { fingerprintCount }

POST /locate
  { lat?, lng?, accuracy?, readings: Reading[] }
  → 200 { matches: [{ place: {id,name,lat,lng}, distance, commonAps }] }   // top 3

GET /places?lat=&lng=&radius=        // lista próximos (bounding box), radius default 300 m, máx 2000
  → 200 Place[]

GET /health → 200 "ok"               // healthcheck do Railway

Reading = { bssid, ssid?, rssi, frequency? }
```

Rate limit global: 30 req/min por IP. Backend reaplica o filtro de APs (seção 2) — nunca confiar só no app.

---

## 6. Algoritmo de match (`/locate`)

kNN simples sobre RSSI, tudo em um service (`locate.service.ts`):

1. Filtrar readings da consulta (`_nomap`, locally administered, RSSI < -90). Se sobrarem < 2 → `matches: []`.
2. **Candidatos:** fingerprints que têm ≥ 1 `bssid` em comum com a consulta (usa o índice `bssid`). Se veio GPS, descartar lugares com lat/lng a mais de `max(500 m, 3 × accuracy)`.
3. Para cada fingerprint candidato:
   - `union` = BSSIDs da consulta ∪ do fingerprint; RSSI ausente = **-100**.
   - `distance = sqrt(média((rssiA - rssiB)²))` em dB.
   - `commonAps` = tamanho da interseção. Ignorar se `commonAps < 2` (a não ser que a consulta só tenha 1 AP — caso iOS).
4. Distância do lugar = **menor** distância entre seus fingerprints.
5. Ordenar por `distance` asc, devolver top 3.

Constantes no topo do arquivo (calibrar com dado real, não inventar config):
```ts
const MISSING_RSSI = -100;
const MIN_RSSI = -90;
const MATCH_THRESHOLD_DB = 12; // app mostra "Você está em X" abaixo disso, senão "Talvez X"
```

Teste obrigatório: `locate.service.spec.ts` com 3 lugares sintéticos — consulta igual a um deles retorna ele em 1º; consulta sem AP em comum retorna vazio; BSSID `_nomap`/locally administered é ignorado.

---

## 7. App — telas (3, sem navegação complexa)

1. **Consentimento** (só na 1ª vez): explica que usa localização e redes Wi-Fi próximas para identificar lugares, que nada de dispositivos pessoais é coletado. Botão pede permissões (`ACCESS_FINE_LOCATION`, `NEARBY_WIFI_DEVICES` no Android 13+). Se a localização do sistema estiver desligada, avisar — sem ela o scan volta vazio.
2. **Home**:
   - Botão grande **Onde estou?** → scan + GPS → `POST /locate` → mostra resultado ("Você está em Sala 3" / "Talvez Sala 3" / "Lugar não mapeado — salvar aqui?").
   - Campo **Nome do lugar** + botão **Salvar** → scan + GPS → `POST /places`.
   - Em cada resultado de match: botão **Estou aqui — adicionar amostra** → `POST /places/:id/fingerprints` (melhora a precisão com o tempo; é o crowdsourcing).
3. **Debug** (aba simples): lista do último scan (SSID, BSSID, RSSI, idade do resultado) e contagem de APs. Essencial para calibrar; pode ficar no MVP.

Feedback de throttling: se o scan retornar resultado com mais de 30 s, mostrar "scan limitado pelo Android, aguarde alguns segundos". Não tentar contornar.

`app.json`: `android.permissions` com `ACCESS_FINE_LOCATION`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `NEARBY_WIFI_DEVICES`. `API_URL` via `EXPO_PUBLIC_API_URL`.

---

## 8. Fases de execução (1 agente Sonnet por fase)

Cada fase termina com o critério de aceite passando. Commitar ao fim de cada fase.

### Fase 1 — Backend base
- `api/`: `nest new` (npm), Prisma, schema da seção 4, migration inicial, `ValidationPipe` global (`whitelist: true`), throttler, `/health`.
- `PlacesModule` com `POST /places`, `POST /places/:id/fingerprints`, `GET /places`.
- Filtro de APs em uma função pura `filterReadings()` reutilizada pelos dois módulos.
- **Aceite:** `npm run build` ok; com Postgres local (docker), `curl` cria lugar e lista por proximidade.

### Fase 2 — Match
- `LocateModule` + `locate.service.ts` conforme seção 6 + spec.
- **Aceite:** `npm test` verde; `curl /locate` com o mesmo payload de um lugar salvo o retorna em 1º.

### Fase 3 — Deploy Railway
- `api/package.json`: `start:prod` = `prisma migrate deploy && node dist/main`. Porta via `process.env.PORT`.
- Railway: serviço com root `api/`, plugin Postgres, `DATABASE_URL` referenciando o plugin, healthcheck `/health`.
- **Aceite:** URL pública responde `/health` e `POST /places`. (Deploy é ação externa — confirmar com o usuário antes.)

### Fase 4 — App
- `app/`: `create-expo-app` (TypeScript), `expo-location`, `expo-secure-store`, `react-native-wifi-reborn`, `expo prebuild` / `eas build --profile development` para Android.
- Telas da seção 7. Um único `api.ts` com as 3 chamadas.
- **Aceite:** em celular Android físico (emulador não tem Wi-Fi real), salvar 2 lugares em cômodos diferentes e o "Onde estou?" acertar cada um.

### Fase 5 — Calibração (com o usuário, em campo)
- Usar a tela Debug, coletar 3–5 amostras por lugar, ajustar `MATCH_THRESHOLD_DB` / `MIN_RSSI` com base no observado.

---

## 9. Próximos passos (pós-MVP, em ordem de valor)

1. Hierarquia **Estabelecimento → Lugar** (agrupar e permitir "dono" do estabelecimento editar).
2. Auth leve (magic link) para donos de estabelecimento; usuários comuns continuam anônimos.
3. Moderação/abuso: denunciar lugar, limite de lugares por device/dia, merge de duplicados.
4. BLE de dispositivos fixos + beacons como sinal extra (e caminho real para iOS).
5. Rotas internas: grafo de lugares conectados ("Recepção → Corredor A → Sala 3") a partir da ordem em que o usuário caminha.
6. PostGIS quando bounding box ficar lento.
7. **Migrar o matching para TensorFlow** (decidido em 2026-10-19: por enquanto fica o KNN de `mobile/matcher.ts`).
   - **Abordagem:** embedding métrico (rede siamesa/triplet) treinado offline em Keras e exportado para TFLite. Substitui só a `distance()`, e o `rank()`/KNN continua igual.
     - Funciona em lugares novos sem retreinar.
     - O KNN atual fica como plano B se o modelo não carregar.
   - **Descartado:** classificador softmax por bloco. Teria que ser retreinado a cada bloco criado ou editado, e com 3–4 amostras por classe só decora as amostras.
   - **Gatilho para começar:** mais de 1.000 scans rotulados, de vários lugares e aparelhos, **e** o eval mostrando que os ajustes simples estagnaram:
     - média das k amostras mais próximas;
     - peso por AP;
     - penalidade de ausência;
     - limiar calibrado.
   - **Medição:** `cd mobile && node --experimental-strip-types matcher.eval.ts <export.json>` (leave-one-out, top-1/top-2, acerto do verde). Um modelo só entra se superar esse número.
     - Linha de base em 2026-10-19, com o `places.json` do WinForms (30 amostras, 10 cômodos): top-1 47%, top-2 67%, verde em 13% das consultas com 100% de acerto.
   - **Coleta de dados para chegar lá:** gravar como amostra extra o scan que o usuário confirmar na navegação (`Navigate.tsx`).
   - **Custos já conhecidos:**
     - nova dependência nativa (por exemplo `react-native-fast-tflite`) e rebuild do APK;
     - pipeline Python;
     - versionamento do modelo;
     - fica menos explicável que o RMS em dB.
   - **O que não muda:** o throttling (4 scans a cada 2 min) e a ausência de scan de Wi-Fi no iOS.

## 10. Riscos

- **iOS limitado** por política da Apple — produto será Android-first enquanto não houver BLE.
- **Precisão** depende da densidade de APs; ambientes com 1–2 redes vão confundir cômodos vizinhos. Esperado ~3–10 m de resolução com boa densidade.
- **APs trocados/desligados** degradam o fingerprint → amostras novas (crowdsourcing) compensam; considerar expirar fingerprints antigos no futuro.
- **Base pública:** sem moderação no MVP; aceitável enquanto o uso é de teste.
