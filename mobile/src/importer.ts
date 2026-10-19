// Pure: web-exported place JSON -> place skeletons (no IO, no RN imports).
import type { Block, PlaceMap } from './store.ts';

export type Skeleton = {
  name: string; lat: number | null; lng: number | null; typeName?: string; map: PlaceMap;
  bgData?: { b64: string; ext: 'png' | 'jpg'; opacity: number };
};

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

export function parsePlaceJson(json: unknown): Skeleton[] {
  const j = json as any;
  if (!j || typeof j !== 'object' || typeof j.name !== 'string' || !j.name.trim()) throw new Error('JSON inválido: falta o nome do lugar');
  const floors: any[] = Array.isArray(j.floors) ? j.floors : j.map ? [{ name: '', map: j.map }] : [];
  if (!floors.length) throw new Error('JSON inválido: nenhum andar/mapa encontrado');
  const out: Skeleton[] = [];
  for (const f of floors) {
    const m = f?.map;
    if (!m || !Number.isInteger(m.cols) || !Number.isInteger(m.rows) || m.cols < 1 || m.rows < 1 || !Array.isArray(m.blocks)) {
      throw new Error(`JSON inválido: mapa do andar "${f?.name ?? '?'}" malformado`);
    }
    const blocks: Block[] = m.blocks.filter((b: any) => b && typeof b.id === 'string' && Array.isArray(b.cells)).map((b: any) => ({
      ...b, samples: Array.isArray(b.samples) ? b.samples : [],
    }));
    if (!blocks.length) continue;
    const s: Skeleton = {
      name: floors.length > 1 ? `${j.name} · ${f.name}` : j.name,
      lat: num(j.lat), lng: num(j.lng),
      typeName: typeof j.typeName === 'string' && j.typeName.trim() ? j.typeName : undefined,
      map: { cols: m.cols, rows: m.rows, blocks },
    };
    const mm = /^data:image\/(png|jpe?g|webp);base64,(.+)$/s.exec(f.bg?.dataUrl ?? '');
    if (mm) s.bgData = { b64: mm[2], ext: mm[1] === 'png' ? 'png' : mm[1] === 'webp' ? ('png' as const) : 'jpg', opacity: num(f.bg.opacity) ?? 0.6 };
    out.push(s);
  }
  if (!out.length) throw new Error('JSON inválido: nenhuma área desenhada');
  return out;
}
