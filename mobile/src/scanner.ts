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
async function run(onWait?: (msLeft: number) => void): Promise<Reading[]> {
  await wait(budgetWaitMs(history, Date.now()), onWait);
  history.push(Date.now());
  const res = await scan();
  return res.readings.filter(keep); // throttled → stale results filtered out by the native timestamp guard → []
}

// Serialized: two screens never scan at once.
export function scanBudgeted(onWait?: (msLeft: number) => void): Promise<Reading[]> {
  const p = chain.then(() => run(onWait));
  chain = p.catch(() => {});
  return p;
}

// BLE is optional redundancy: any failure (off, no permission, no module) is just "no readings".
export const bleScanSafe = (ms = 4000): Promise<Reading[]> =>
  bleScan(ms)
    .then((l) => l.filter((b) => b.rssi >= MIN_RSSI).map((b) => ({ bssid: b.id, ssid: b.name, rssi: b.rssi })))
    .catch(() => []);

// Connected network (unthrottled, 1 AP). null when not associated / filtered out / unavailable.
export const connectedSafe = (): Promise<Reading | null> =>
  connected()
    .then((c) => (c && keep(c) ? { bssid: c.bssid, ssid: c.ssid, rssi: c.rssi } : null))
    .catch(() => null);

export const wifiReadyNow = () => budgetWaitMs(history, Date.now()) === 0;
