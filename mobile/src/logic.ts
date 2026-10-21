import type { Cell } from './store.ts';

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export const BUDGET_MAX = 4; // o limite do Android: 4 scans por 2 min, por app
export const BUDGET_WINDOW_MS = 120000;

// Timestamps a acrescentar ao histórico quando o Android recusa um scan. O orçamento dele sobrevive
// ao fechamento do app, o nosso histórico não: diante de um "não", enchemos a janela em vez de insistir.
export function throttleFill(history: number[], now: number, max = BUDGET_MAX, windowMs = BUDGET_WINDOW_MS): number[] {
  const inWin = history.filter((t) => now - t < windowMs).length;
  return Array(Math.max(0, max - inWin)).fill(now);
}

// 0 if fewer than `max` scans in the window, else ms until the oldest in-window scan leaves it.
export function budgetWaitMs(history: number[], now: number, max = BUDGET_MAX, windowMs = BUDGET_WINDOW_MS): number {
  const inWin = history.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (inWin.length < max) return 0;
  return inWin[inWin.length - max] + windowMs - now;
}

export type ScanPlan = { use: 'cache' | 'active' | 'wait'; waitMs: number };

// Scan ativo é o recurso escasso (4/2min): só gasta quando o cache não serve ou o usuário mudou/pediu.
// Orçamento estourado nunca bloqueia se há cache; waitMs é só contagem regressiva para a UI (exceto em 'wait').
export function planScan(input: {
  cacheAgeMs: number | null;
  maxAgeMs: number;
  budgetWaitMs: number;
  moved: boolean;
  forced: boolean;
}): ScanPlan {
  const { cacheAgeMs, maxAgeMs, budgetWaitMs, moved, forced } = input;
  const hasCache = cacheAgeMs !== null;
  if (hasCache && cacheAgeMs <= maxAgeMs && !(moved || forced)) return { use: 'cache', waitMs: 0 };
  if (budgetWaitMs === 0) return { use: 'active', waitMs: 0 };
  return hasCache ? { use: 'cache', waitMs: budgetWaitMs } : { use: 'wait', waitMs: budgetWaitMs };
}

export function bbox(cells: Cell[]) {
  const cs = cells.map((x) => x.c);
  const rs = cells.map((x) => x.r);
  return { c0: Math.min(...cs), r0: Math.min(...rs), c1: Math.max(...cs), r1: Math.max(...rs) };
}

// Center of the bbox in cell units (cell (0,0) center = 0.5,0.5).
export function blockCenter(cells: Cell[]) {
  const b = bbox(cells);
  return { c: (b.c0 + b.c1 + 1) / 2, r: (b.r0 + b.r1 + 1) / 2 };
}

export const arrowDeg = (heading: number, headingRef: number) => (((heading - headingRef) % 360) + 360) % 360;

export function rectCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push({ c, r });
  return out;
}

// Qualidade do mapa de um lugar. Uma leitura por bloco basta: é com ela que o matcher trabalha e
// já permite navegar. Exigir mais (ex.: várias por quadrado) esbarraria o tempo todo no throttling do
// Android (4 scans / 2 min) e travaria o mapeamento. Amostras extras continuam possíveis e
// melhoram o matcher, mas são opcionais.
type HasSamples = { samples: unknown[] };

export function mapQuality(blocks: HasSamples[]) {
  return {
    blocks: blocks.length,
    scanned: blocks.filter((b) => b.samples.length > 0).length,
    samples: blocks.reduce((n, b) => n + b.samples.length, 0),
  };
}

export const canNavigate = (blocks: HasSamples[]) => blocks.some((b) => b.samples.length > 0);

export function mapQualityLabel(blocks: HasSamples[]): string {
  const q = mapQuality(blocks);
  if (!q.blocks) return 'Mapa sem quadrados';
  const quad = `${q.blocks} quadrado${q.blocks > 1 ? 's' : ''}`;
  if (!q.scanned) return `${quad} · nenhuma leitura`;
  return `${quad} · ${q.scanned} com leitura`;
}
