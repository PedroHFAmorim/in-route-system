export const MISSING_RSSI = -100;
export const MIN_RSSI = -90;
export const THRESHOLD_DB = 12;

export type Reading = { bssid: string; ssid?: string; rssi: number };
export type Sample = { name: string; createdAt: string; readings: Reading[] };
export type Match = { name: string; dist: number; common: number };

export function keep(r: Reading): boolean {
  if (r.ssid && r.ssid.toLowerCase().endsWith('_nomap')) return false;
  if ((parseInt(r.bssid.slice(0, 2), 16) & 0x02) !== 0) return false; // locally administered
  return r.rssi >= MIN_RSSI;
}

const byBssid = (rs: Reading[]) => new Map(rs.map((r) => [r.bssid, r.rssi] as const)); // last wins

// RMS distance in dB; null when too few APs in common.
export function distance(query: Reading[], s: Sample): { dist: number; common: number } | null {
  const q = byBssid(query);
  const d = byBssid(s.readings);
  const need = q.size === 1 ? 1 : 2;
  let common = 0;
  for (const k of q.keys()) if (d.has(k)) common++;
  if (common < need) return null;
  const keys = new Set([...q.keys(), ...d.keys()]);
  let sum = 0;
  for (const k of keys) {
    const diff = (q.get(k) ?? MISSING_RSSI) - (d.get(k) ?? MISSING_RSSI);
    sum += diff * diff;
  }
  return { dist: Math.sqrt(sum / keys.size), common };
}

// One entry per place (min distance over its samples), best first.
export function rank(query: Reading[], samples: Sample[]): Match[] {
  const best = new Map<string, Match>();
  for (const s of samples) {
    const m = distance(query, s);
    if (!m) continue;
    const cur = best.get(s.name);
    if (!cur || m.dist < cur.dist) best.set(s.name, { name: s.name, ...m });
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}
