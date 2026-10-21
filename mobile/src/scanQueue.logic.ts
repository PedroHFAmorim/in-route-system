// Lógica pura da fila de scans (sem React Native / AsyncStorage), testável com node.

// Contrato da API usa `frequency`; o módulo nativo devolve `freq`. Único ponto de conversão.
export type ApiWifi = { bssid: string; ssid?: string; rssi: number; frequency?: number };
export const toApiWifi = (raw: { bssid: string; ssid?: string; rssi: number; freq?: number }[]): ApiWifi[] =>
  raw.map(({ freq, ...r }) => (freq != null ? { ...r, frequency: freq } : r));

export type ScanPayload = {
  deviceId: string; platform: string; kind: 'sample' | 'locate' | 'debug';
  placeId?: string; placeName?: string; blockId?: string; blockName?: string;
  lat?: number | null; lng?: number | null; accuracy?: number | null; heading?: number | null;
  startedAt: string;
  wifi: ApiWifi[];
  ble: { bssid: string; ssid?: string; rssi: number }[];
  match?: { name: string; dist: number; common: number; source: string; sure: boolean } | null;
  note?: string;
};

export const MAX_QUEUE = 200;
export const BATCH = 50;

// Mantém só os `max` mais recentes (o fim da lista é o mais novo).
export const capQueue = <T>(q: T[], max = MAX_QUEUE): T[] => (q.length > max ? q.slice(q.length - max) : q);

export function chunk<T>(q: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < q.length; i += size) out.push(q.slice(i, i + size));
  return out;
}

// Resposta do /scans/batch: { ids, failed }. Aceita duas formas:
//  - `ids` alinhado ao lote (null/false = falhou naquele índice);
//  - `ids` só com os aceitos e `failed` = lista de índices que falharam (número ou { index }).
// Qualquer outra forma: nada é removido (melhor reenviar do que perder dado).
export function removeConfirmed<T>(queue: T[], sent: T[], ids: unknown, failed?: unknown): T[] {
  if (!Array.isArray(ids)) return queue;
  const failedIdx = new Set<number>();
  if (Array.isArray(failed)) for (const f of failed) {
    const n = typeof f === 'number' ? f : typeof f?.index === 'number' ? f.index : -1;
    if (n >= 0) failedIdx.add(n);
  }
  let okIdx: number[];
  if (ids.length === sent.length) okIdx = sent.map((_, i) => i).filter((i) => ids[i] != null && ids[i] !== false && !failedIdx.has(i));
  else if (failed !== undefined && ids.length === sent.length - failedIdx.size) okIdx = sent.map((_, i) => i).filter((i) => !failedIdx.has(i));
  else return queue;
  const ok = new Set(okIdx.map((i) => sent[i]));
  return queue.filter((x) => !ok.has(x));
}
