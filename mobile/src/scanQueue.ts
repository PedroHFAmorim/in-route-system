import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, apiEnabled } from './api.ts';
import { getDeviceId } from './deviceId.ts';
import { BATCH, capQueue, chunk, removeConfirmed, type ScanPayload } from './scanQueue.logic.ts';

const KEY = 'inroute:scanq';
export type ScanInput = Omit<ScanPayload, 'deviceId' | 'platform'>;

let pending = 0;
const listeners = new Set<(n: number) => void>();
const setPending = (n: number) => { pending = n; listeners.forEach((l) => l(n)); };
export const pendingCount = () => pending;
export function onPending(l: (n: number) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// Serializa leitura/escrita da fila (enqueue e flush nunca se atropelam).
let chain: Promise<unknown> = Promise.resolve();
const locked = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
};

async function read(): Promise<ScanPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}
async function write(q: ScanPayload[]) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(q)); } catch {}
  setPending(q.length);
}

async function flushLocked() {
  if (!apiEnabled()) { setPending((await read()).length); return; }
  let q = await read();
  setPending(q.length);
  while (q.length) {
    const batch = chunk(q, BATCH)[0];
    let res: { ids?: unknown; failed?: unknown };
    try { res = (await api.postScansBatch(batch)) ?? {}; } catch {
      // 401 (token expirado) ou sem rede/servidor fora: só para o flush. Nada sai da fila; tenta de novo
      // no próximo flush (após novo login, no caso do 401).
      return;
    }
    const next = removeConfirmed(q, batch, res.ids, res.failed);
    if (next.length === q.length) return; // nada confirmado: não insiste em loop
    q = next;
    await write(q);
  }
}

// Nunca lança.
export function flush(): Promise<void> {
  return locked(flushLocked).catch(() => {});
}

// Grava na fila (corte em 200) e tenta mandar em seguida, sem bloquear quem chamou. Nunca lança.
export function enqueue(scan: ScanInput): void {
  if (!apiEnabled()) return;
  locked(async () => {
    const deviceId = await getDeviceId();
    const q = capQueue([...(await read()), { ...scan, deviceId, platform: Platform.OS } as ScanPayload]);
    await write(q);
    await flushLocked();
  }).catch(() => {});
}
