// Mesma regra de mobile/matcher.ts (keep). Só marca `kept`; nada é descartado na entrada.
export const MIN_RSSI = -90;

export type KeepInput = { bssid: string; ssid?: string | null; rssi: number };

export function keep(r: KeepInput): boolean {
  if (r.ssid && r.ssid.toLowerCase().endsWith('_nomap')) return false;
  if ((parseInt(r.bssid.slice(0, 2), 16) & 0x02) !== 0) return false; // administrado localmente (MAC aleatório)
  return r.rssi >= MIN_RSSI;
}
