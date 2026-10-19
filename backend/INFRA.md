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
│   internet ───► domínio ─────► │  backend (Node)  │        │
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

## 2. Serviço — backend Node
- **New → GitHub Repo** → este repositório.
- **Settings → Root Directory:** `/backend` (monorepo; o resto do repo é ignorado no build).
- **Builder:** Nixpacks (auto). Lê o `package.json`: instala deps, roda `npm run build` (tsc → `dist/`), sobe com `npm run start`. Sem Dockerfile.
- **Health check:** `/health` (já em `railway.json`).
- **Porta:** a Railway injeta `PORT`; o Express já escuta em `process.env.PORT`.

## 3. Variáveis de ambiente (no serviço backend)
| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | **Reference variable** — aponta pro Postgres do projeto, pela rede privada |
| `PGSSL` | *(vazio)* | Rede interna da Railway não usa SSL. Use `require` só se conectar pelo proxy público |
| `PORT` | *(auto)* | A Railway define; não setar manualmente |

## 4. Domínio público
- **Settings → Networking → Generate Domain** → `https://<serviço>.up.railway.app`.
- É essa URL que o app mobile consome (ver `mobile/app.json` → `extra.apiUrl`).

## 5. Migrations
- MVP: `initDb()` roda `CREATE TABLE IF NOT EXISTS` no boot. Sem ferramenta de migration.
- Quando o schema evoluir de forma destrutiva, trocar por um passo de release (ex.: `node-pg-migrate` num `releaseCommand`). Até lá, mudanças aditivas bastam.

## 6. Deploy contínuo
- A Railway redeploya a cada push no branch conectado. Sem pipeline manual.
- Rollback: aba **Deployments** → redeploy de uma versão anterior.

## Rodar localmente
```bash
cd backend
cp .env.example .env            # ajuste DATABASE_URL se preciso
docker run -d --name inroute-pg -e POSTGRES_USER=inroute -e POSTGRES_PASSWORD=inroute -e POSTGRES_DB=inroute -p 5432:5432 postgres:16
npm install
npm run dev                     # http://localhost:3000/health
```
