# Infraestrutura — Railway

Plano de deploy do backend In-Route na [Railway](https://railway.app). Dois serviços num mesmo projeto, ligados pela rede privada da Railway.

```
┌──────────────── Railway Project: in-route ────────────────┐
│                                                            │
│   ┌─────────────────┐        ${{Postgres.DATABASE_URL}}   │
│   │  Postgres        │◄───────────────┐                   │
│   │  (plugin/managed)│                │ (rede privada)    │
│   └─────────────────┘                │                   │
│                                ┌──────┴───────────┐        │
│   internet ───► domínio ─────► │  backend (Nest)  │        │
│                 público        │  /backend, Nixpacks        │
│                                └──────────────────┘        │
└────────────────────────────────────────────────────────────┘
          ▲
          │ HTTPS
   App React Native (mobile)
```

## 1. Banco — Postgres gerenciado
- No projeto Railway: **New → Database → Add PostgreSQL**. A Railway provisiona e gerencia (backups, upgrades).
- Ele expõe `DATABASE_URL` (e `PGHOST`, `PGUSER`, etc.). Não copiar o valor — referenciar (passo 3).

## 2. Serviço — backend NestJS + Prisma
- **New → GitHub Repo** → este repositório.
- **Settings → Root Directory:** `/backend` (monorepo).
- **Builder:** Nixpacks (auto). `postinstall` roda `prisma generate`, `build` = `nest build` (-> `dist/`), `start` = `prisma migrate deploy && node dist/main`. Sem Dockerfile.
- **Start command / Health check:** configurados pelo serviço na Railway (não há mais `railway.json`). Healthcheck: `/health` (rota pública).
- **Porta:** a Railway injeta `PORT`; a API escuta em `0.0.0.0:${PORT ?? 3000}`.

## 3. Variáveis de ambiente (no serviço backend)
| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference variable, pela rede privada |
| `JWT_SECRET` | `openssl rand -hex 32` | **Obrigatória**: a API não sobe sem ela. Tokens JWT HS256, validade de 30 dias |
| `ADMIN_EMAIL` | e-mail do primeiro admin | Criado no boot se ainda não existir (idempotente) |
| `ADMIN_PASSWORD` | senha (mínimo 8 caracteres) | Usada só para criar o admin; depois pode ser removida |
| `PORT` | *(auto)* | Não setar |

Não há cadastro aberto: todas as rotas exigem `Authorization: Bearer <token>`, exceto `GET /health` e `POST /auth/login` (10 tentativas/min por IP; o resto: 300 req/min por IP). Coletores são criados por um admin em `POST /auth/users`. Sem usuário algum e sem `ADMIN_EMAIL`/`ADMIN_PASSWORD`, a API loga um aviso e ninguém consegue entrar.

## 4. Domínio público
- **Settings → Networking → Generate Domain** → `https://<serviço>.up.railway.app`.
- É essa URL que o app mobile consome (ver `mobile/app.json` → `extra.apiUrl`).

## 5. Migrations
- Prisma Migrate. Os arquivos ficam em `prisma/migrations/` (commitados). No deploy, `npm start` roda `prisma migrate deploy` antes de subir a API.
- Mudou o `schema.prisma`: `npx prisma migrate dev --name <descricao>` localmente e commite a pasta gerada.

## 6. Deploy contínuo
- A Railway redeploya a cada push no branch conectado. Sem pipeline manual.
- Rollback: aba **Deployments** → redeploy de uma versão anterior.

## Rodar localmente
Use o **proxy TCP do Postgres** da Railway (Postgres -> Settings -> Networking -> TCP Proxy) ou um Postgres local.
```bash
cd backend
cp .env.example .env     # DATABASE_URL = URL do proxy TCP público (host.proxy.rlwy.net:porta); defina JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install              # roda prisma generate
npx prisma migrate dev   # aplica as migrations no banco
npm run start:dev        # http://localhost:3000/health
npm test
```
`.env` está no `.gitignore`; nunca commitar credenciais.

## Coleta de scans
- `POST /scans` e `POST /scans/batch` gravam o scan cru + todas as leituras (inclusive as descartadas pelo filtro, com `kept=false`).
- `GET /scans/export` (ndjson por padrão, streamado) e `GET /stats` servem para análise offline.
