This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Coleta de scans (API)

- `EXPO_PUBLIC_API_URL` é o interruptor: definida, o app usa o backend (lugares) e envia cada leitura de Wi-Fi/BLE; ausente, tudo fica só no aparelho. Copie `.env.example` para `.env` e preencha.
- O Expo embute `EXPO_PUBLIC_*` **no build**: o APK guarda o valor de quando foi gerado. Mudou a URL, gere o APK de novo (ou reinicie o `expo start` no dev).
- Cada captura de amostra (`MapEditor`, `kind: "sample"`) e cada ciclo de navegação (`Navigate`, `kind: "locate"`, inclusive sem match) vai para `POST /scans` com as leituras **cruas** (sem o filtro `keep()`/`MIN_RSSI`; o matcher continua usando só as filtradas). `scanBudgetedFull`/`bleScanFull` em `src/scanner.ts` devolvem filtrada + crua do mesmo scan.
- Fila offline em `src/scanQueue.ts` (AsyncStorage `inroute:scanq`, máx. 200, descarta as mais antigas); `flush()` manda lotes de 50 em `/scans/batch` ao abrir o app e após cada enqueue, removendo só o que o servidor confirmou. Falhas de rede são silenciosas. Lógica pura em `src/scanQueue.logic.ts`.
- `deviceId` (UUID v4 em `inroute:deviceId`) vai no header `X-Device-Id` de todas as chamadas.
- Checks: `node --experimental-strip-types src/scanQueue.check.ts`.
- **Login (só com `EXPO_PUBLIC_API_URL` definida)**: a API exige `Authorization: Bearer <token>` em tudo, menos `GET /health` e `POST /auth/login`. Não há cadastro no app: **o admin cria os usuários** no backend. O app abre na tela `Login` (e-mail + senha → `POST /auth/login`); token JWT (30 dias) e usuário ficam em `inroute:auth` (`src/auth.ts`, com cache em memória). Sem a variável, o app é offline e nenhum login aparece.
- `src/api.ts` manda o Bearer em toda chamada. **401** limpa a sessão, o `App.tsx` volta pro Login e o erro lançado é `UnauthorizedError` (`isUnauthorized(e)`), diferente de erro de rede. Ao abrir, o token é validado em segundo plano com `GET /auth/me`: 401 cai no Login; sem rede segue usando o app (modo campo).
- A fila de scans nunca perde dado por 401: o flush só para e reenvia após o próximo login (`App.tsx` chama `flush()` ao entrar). "Sair" (na Home) não apaga a fila.
- Lógica pura em `src/authLogic.ts`; check: `node --experimental-strip-types src/authLogic.check.ts`.
