import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida. Copie .env.example para .env (ver INFRA.md).');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's public proxy needs SSL; internal networking does not. Toggle with PGSSL=require.
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

// Tables created on boot. For a POC this replaces a migration tool; the schema is additive-only.
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS types (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS places (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      type_id    TEXT,
      lat        DOUBLE PRECISION,
      lng        DOUBLE PRECISION,
      address    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      map        JSONB
    );
  `);
}
