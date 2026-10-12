import { scan } from '../modules/wifi-scan';
import { keep, type Reading } from '../matcher.ts';
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

async function run(onWait?: (msLeft: number) => void): Promise<Reading[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await wait(budgetWaitMs(history, Date.now()), onWait);
    history.push(Date.now());
    const res = await scan();
    const fresh = res.readings.filter(keep);
    if (!res.throttled && fresh.length > 0) return fresh;
    // Throttled anyway (our history disagrees with Android's): retry in 30 s; 3 attempts ≈ 90 s max.
    await wait(30000, onWait);
  }
  throw new Error('Android bloqueou o scan. Tente novamente em instantes.');
}

// Serialized: two screens never scan at once.
export function scanBudgeted(onWait?: (msLeft: number) => void): Promise<Reading[]> {
  const p = chain.then(() => run(onWait));
  chain = p.catch(() => {});
  return p;
}
