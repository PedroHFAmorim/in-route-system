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

// 0 if fewer than `max` scans in the window, else ms until the oldest in-window scan leaves it.
export function budgetWaitMs(history: number[], now: number, max = 4, windowMs = 120000): number {
  const inWin = history.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (inWin.length < max) return 0;
  return inWin[inWin.length - max] + windowMs - now;
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
