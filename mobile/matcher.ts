export const MISSING_RSSI = -100;
export const MIN_RSSI = -90;
export const THRESHOLD_DB = 12;
export const BLE_THRESHOLD_DB = 8; // ponytail: initial guess, tune in field

export type Reading = { bssid: string; ssid?: string; rssi: number };
export type Sample = { name: string; createdAt: string; readings: Reading[]; ble?: Reading[] };
export type Match = { name: string; dist: number; common: number };

export function keep(r: Reading): boolean {
  if (r.ssid && r.ssid.toLowerCase().endsWith('_nomap')) return false;
  if ((parseInt(r.bssid.slice(0, 2), 16) & 0x02) !== 0) return false; // locally administered
  return r.rssi >= MIN_RSSI;
}

const byBssid = (rs: Reading[]) => new Map(rs.map((r) => [r.bssid, r.rssi] as const)); // last wins

// RMS distance in dB; null when too few APs in common.
// union=false: only keys in both (BLE has many transient phones). ref = which readings of s to compare.
export function distance(query: Reading[], s: Sample, union = true, ref: Reading[] = s.readings): { dist: number; common: number } | null {
  const q = byBssid(query);
  const d = byBssid(ref);
  const need = q.size === 1 ? 1 : 2;
  let common = 0;
  for (const k of q.keys()) if (d.has(k)) common++;
  if (common < need) return null;
  const keys = new Set(union ? [...q.keys(), ...d.keys()] : [...q.keys()].filter((k) => d.has(k)));
  let sum = 0;
  for (const k of keys) {
    const diff = (q.get(k) ?? MISSING_RSSI) - (d.get(k) ?? MISSING_RSSI);
    sum += diff * diff;
  }
  return { dist: Math.sqrt(sum / keys.size), common };
}

// One entry per place (min distance over its samples), best first.
export function rank(query: Reading[], samples: Sample[], ble = false): Match[] {
  const best = new Map<string, Match>();
  for (const s of samples) {
    const m = distance(query, s, !ble, ble ? (s.ble ?? []) : s.readings);
    if (!m) continue;
    const cur = best.get(s.name);
    if (!cur || m.dist < cur.dist) best.set(s.name, { name: s.name, ...m });
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}

export const rankBle = (query: Reading[], samples: Sample[]) => rank(query, samples, true);

export type Fused = Match & { source: 'wifi' | 'ble' | 'both'; sure: boolean };
// wifiConfirmed=false when the Wi-Fi match came from the connected-AP fallback (1 AP, no full scan):
// it can still locate you, but never as a confident "green" — only BLE or a full scan confirms.
export function fuse(wifi: Match | null, ble: Match | null, wifiConfirmed = true): Fused | null {
  if (wifi && wifiConfirmed && wifi.dist < THRESHOLD_DB) return { ...wifi, source: ble?.name === wifi.name ? 'both' : 'wifi', sure: true };
  if (ble && ble.dist < BLE_THRESHOLD_DB) return { ...ble, source: wifi?.name === ble.name ? 'both' : 'ble', sure: true };
  if (wifi) return { ...wifi, source: 'wifi', sure: false };
  return ble && { ...ble, source: 'ble', sure: false };
}
