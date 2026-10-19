import { bleScan, connected, scan } from '../modules/wifi-scan';
import { MIN_RSSI, keep, type Reading } from '../matcher.ts';
import { budgetWaitMs } from './logic.ts';

const history: number[] = []; // timestamps of scans actually started
let chain: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wait(ms: number, onWait?: (msLeft: number) => void) {
  const end = Date.now() + ms;
  for (let left = ms; left > 0; left = end - Date.now()) {
    onWait?.(left);
    await sleep(Math.min(1000, left));
  }
}

// One full scan attempt. No 30s retry loop: if Android throttles, we fail fast and fall back to
// the connected AP + BLE (both unthrottled) instead of freezing the UI for ~90s.
// Leitura crua (coleta de dados): tudo que o scan devolveu, inclusive o que o keep() descarta.
export type RawReading = Reading & { frequency?: number };
export type WifiScanFull = { kept: Reading[]; raw: RawReading[]; startedAt: string };

async function run(onWait?: (msLeft: number) => void): Promise<WifiScanFull> {
  await wait(budgetWaitMs(history, Date.now()), onWait);
  const t0 = Date.now();
  history.push(t0);
  const res = await scan();
  const raw: RawReading[] = res.readings.map((r) => ({ bssid: r.bssid, ssid: r.ssid, rssi: r.rssi, frequency: r.freq }));
  return { kept: res.readings.filter(keep), raw, startedAt: new Date(t0).toISOString() }; // throttled → stale results filtered out by the native timestamp guard → []
}

// Serialized: two screens never scan at once.
// Mesma fila/budget; devolve a lista filtrada (p/ o matcher) e a crua (p/ envio à API) do mesmo scan.
export function scanBudgetedFull(onWait?: (msLeft: number) => void): Promise<WifiScanFull> {
  const p = chain.then(() => run(onWait));
  chain = p.catch(() => {});
  return p;
}
export const scanBudgeted = (onWait?: (msLeft: number) => void): Promise<Reading[]> => scanBudgetedFull(onWait).then((r) => r.kept);

// BLE is optional redundancy: any failure (off, no permission, no module) is just "no readings".
export type BleScanFull = { kept: Reading[]; raw: Reading[] };
export const bleScanFull = (ms = 4000): Promise<BleScanFull> =>
  bleScan(ms)
    .then((l) => {
      const raw = l.map((b) => ({ bssid: b.id, ssid: b.name, rssi: b.rssi }));
      return { kept: raw.filter((b) => b.rssi >= MIN_RSSI), raw };
    })
    .catch(() => ({ kept: [], raw: [] }));
export const bleScanSafe = (ms = 4000): Promise<Reading[]> => bleScanFull(ms).then((r) => r.kept);

// Connected network (unthrottled, 1 AP). null when not associated / filtered out / unavailable.
export const connectedSafe = (): Promise<Reading | null> =>
  connected()
    .then((c) => (c && keep(c) ? { bssid: c.bssid, ssid: c.ssid, rssi: c.rssi } : null))
    .catch(() => null);

export const wifiReadyNow = () => budgetWaitMs(history, Date.now()) === 0;
