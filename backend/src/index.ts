import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { initDb, pool } from './db';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // maps carry scan samples and can be large

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// DB row -> API shape expected by the mobile app (store.ts Place).
const rowToPlace = (r: any) => ({
  id: r.id,
  name: r.name,
  typeId: r.type_id ?? '',
  lat: r.lat,
  lng: r.lng,
  address: r.address ?? undefined,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  map: r.map ?? undefined,
});

// Validate at the trust boundary. Returns an error string or null.
function validatePlace(b: any): string | null {
  if (!b || typeof b !== 'object') return 'corpo inválido';
  if (typeof b.name !== 'string' || !b.name.trim()) return 'name é obrigatório';
  if (b.lat != null && typeof b.lat !== 'number') return 'lat deve ser número ou null';
  if (b.lng != null && typeof b.lng !== 'number') return 'lng deve ser número ou null';
  if (b.map != null && typeof b.map !== 'object') return 'map deve ser objeto ou null';
  return null;
}

async function upsertPlace(id: string, b: any) {
  const { rows } = await pool.query(
    `INSERT INTO places (id, name, type_id, lat, lng, address, created_at, map)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, type_id = EXCLUDED.type_id, lat = EXCLUDED.lat,
       lng = EXCLUDED.lng, address = EXCLUDED.address, map = EXCLUDED.map
     RETURNING *`,
    [id, b.name.trim(), b.typeId || null, b.lat ?? null, b.lng ?? null, b.address || null, b.createdAt || null, b.map ?? null]
  );
  return rowToPlace(rows[0]);
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// Everything the app needs on load, in one round-trip.
app.get('/bootstrap', async (_req, res, next) => {
  try {
    const [places, types] = await Promise.all([
      pool.query('SELECT * FROM places ORDER BY created_at DESC'),
      pool.query('SELECT * FROM types ORDER BY name'),
    ]);
    res.json({ places: places.rows.map(rowToPlace), types: types.rows });
  } catch (e) { next(e); }
});

app.get('/places', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM places ORDER BY created_at DESC');
    res.json(rows.map(rowToPlace));
  } catch (e) { next(e); }
});

app.get('/places/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM places WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'lugar não encontrado' });
    res.json(rowToPlace(rows[0]));
  } catch (e) { next(e); }
});

// Create or upsert (the app generates the id client-side and saves by id).
app.post('/places', async (req, res, next) => {
  try {
    const err = validatePlace(req.body);
    if (err) return res.status(400).json({ error: err });
    const id = typeof req.body.id === 'string' && req.body.id ? req.body.id : newId();
    res.status(201).json(await upsertPlace(id, req.body));
  } catch (e) { next(e); }
});

app.put('/places/:id', async (req, res, next) => {
  try {
    const err = validatePlace(req.body);
    if (err) return res.status(400).json({ error: err });
    res.json(await upsertPlace(req.params.id, req.body));
  } catch (e) { next(e); }
});

app.delete('/places/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM places WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'lugar não encontrado' });
    res.status(204).end();
  } catch (e) { next(e); }
});

app.get('/types', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM types ORDER BY name');
    res.json(rows);
  } catch (e) { next(e); }
});

// ensureType: idempotent create by name (case-insensitive).
app.post('/types', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const existing = await pool.query('SELECT * FROM types WHERE lower(name) = lower($1)', [name]);
    if (existing.rows.length) return res.json(existing.rows[0]);
    const { rows } = await pool.query('INSERT INTO types (id, name) VALUES ($1, $2) RETURNING *', [newId(), name]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// Error handler (last).
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'erro interno', detail: String(err?.message ?? err) });
});

const port = Number(process.env.PORT) || 3000;
initDb()
  .then(() => app.listen(port, () => console.log(`In-Route API em :${port}`)))
  .catch((e) => { console.error('Falha ao iniciar o banco:', e); process.exit(1); });
