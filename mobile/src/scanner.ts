import { bleScan, bleSnapshot, connected, scan, type RawReading, type ScanSource } from '../modules/wifi-scan';
import { MIN_RSSI, keep, type Reading } from '../matcher.ts';
import { budgetWaitMs, planScan, throttleFill } from './logic.ts';

export { startPassive, stopPassive, passiveStats, addScanResultsListener } from '../modules/wifi-scan';
// Fontes sem limite do Android: RSSI conectado por evento e sessão BLE contínua.
export { startConnWatch, stopConnWatch, addConnListener, startBleSession, stopBleSession } from '../modules/wifi-scan';
export type { RawReading, ScanSource };

const history: number[] = []; // timestamps of ACTIVE scans actually performed
let chain: Promise<unknown> = Promise.resolve();

// Teto da leitura grátis: pegamos tudo que o cache do sistema tem e deixamos o planScan julgar a
// idade. Filtrar aqui por maxAgeMs cegaria o fallback "orçamento estourado, use o que houver".
const CACHE_CEILING_MS = 300000;

export type ScanOpts = { maxAgeMs?: number; moved?: boolean; forced?: boolean; allowActive?: boolean };
// Leitura crua (coleta de dados): tudo que o scan devolveu, inclusive o que o keep() descarta.
export type WifiScanFull = {
  kept: Reading[];
  raw: RawReading[];
  startedAt: string;
  ageMs: number | null;
  source: ScanSource;
  throttled: boolean;
  waitMs: number; // ms até poder gastar um scan ativo; 0 se pode agora
};

// Nunca bloqueia: lê o cache do sistema (grátis) e só pede scan ativo se planScan mandar.
async function run(opts: ScanOpts): Promise<WifiScanFull> {
  const { maxAgeMs = 30000, moved = false, forced = false, allowActive = true } = opts;
  const t0 = Date.now();
  const cached = await scan({ allowActive: false, maxAgeMs: CACHE_CEILING_MS });
  const plan = planScan({
    cacheAgeMs: cached.readings.length ? cached.ageMs : null,
    maxAgeMs,
    budgetWaitMs: budgetWaitMs(history, t0),
    moved,
    forced,
  });
  let res = cached;
  let waitMs = plan.waitMs;
  if (plan.use === 'active' && allowActive) {
    // maxAgeMs 0 pula o cache dentro do nativo: se decidimos gastar um scan, é porque queremos dado
    // novo — senão o "Atualizar agora" devolveria a mesma leitura de sempre.
    const tActive = Date.now();
    res = await scan({ allowActive: true, maxAgeMs: 0 });
    // Só scan ativo gasta o orçamento do Android; cache/throttled não contam (senão o orçamento é
    // superestimado). O instante é o do scan, não o do início da chamada: o ativo leva até 8 s e
    // contar t0 liberaria o próximo scan cedo demais, provocando throttling de verdade.
    if (res.source === 'active') history.push(tActive);
    // O Android lembra do orçamento entre aberturas do app, o history não (é só memória). Quando ele
    // recusa, acreditamos nele: enchemos a janela para parar de insistir e informamos a espera real.
    if (res.throttled) {
      history.push(...throttleFill(history, tActive));
      waitMs = budgetWaitMs(history, Date.now());
    }
  } else if (plan.use === 'active') {
    waitMs = 0;
  }
  // Defesa central contra o bug do andar errado: leitura acima de maxAgeMs nunca entra no match, por
  // mais que o cache a ofereça. A crua vai inteira (com a idade de cada AP) para a API e o diagnóstico.
  const fresh = res.readings.filter((r) => r.ageMs <= maxAgeMs);
  return {
    kept: fresh.filter(keep),
    raw: res.readings,
    startedAt: new Date(t0).toISOString(),
    ageMs: fresh.length ? Math.min(...fresh.map((r) => r.ageMs)) : res.ageMs,
    source: res.source,
    throttled: res.throttled,
    waitMs,
  };
}

// Serialized: two screens never scan at once.
// Mesma fila/budget; devolve a lista filtrada (p/ o matcher) e a crua (p/ envio à API) do mesmo scan.
export function scanBudgetedFull(opts: ScanOpts = {}): Promise<WifiScanFull> {
  const p = chain.then(() => run(opts));
  chain = p.catch(() => {});
  return p;
}

// BLE is optional redundancy: any failure (off, no permission, no module) is just "no readings".
export type BleScanFull = { kept: Reading[]; raw: Reading[] };
export const bleScanFull = (ms = 4000): Promise<BleScanFull> =>
  bleScan(ms)
    .then((l) => {
      const raw = l.map((b) => ({ bssid: b.id, ssid: b.name, rssi: b.rssi }));
      return { kept: raw.filter((b) => b.rssi >= MIN_RSSI), raw };
    })
    .catch(() => ({ kept: [], raw: [] }));

// Instantâneo da sessão BLE contínua: volta na hora (sem os 4 s do bleScanFull). Exige startBleSession ativa.
export const bleSnapshotFull = (windowMs?: number): Promise<BleScanFull> =>
  bleSnapshot(windowMs)
    .then((l) => {
      const raw = l.map((b) => ({ bssid: b.id, ssid: b.name, rssi: b.rssi }));
      return { kept: raw.filter((b) => b.rssi >= MIN_RSSI), raw };
    })
    .catch(() => ({ kept: [], raw: [] }));

// Connected network (unthrottled, 1 AP). null when not associated / filtered out / unavailable.
export const connectedSafe = (): Promise<Reading | null> =>
  connected()
    .then((c) => (c && keep(c) ? { bssid: c.bssid, ssid: c.ssid, rssi: c.rssi } : null))
    .catch(() => null);

export const wifiReadyNow = () => budgetWaitMs(history, Date.now()) === 0;
