import type { PlaceType } from './store.ts';
import type { Place } from './store.ts';
import { getDeviceId } from './deviceId.ts';
import type { ScanPayload } from './scanQueue.logic.ts';
import { BASE } from './config.ts';
import { clearSession, getToken } from './auth.ts';
import type { AuthUser } from './authLogic.ts';

// BASE vem de config.ts. Definida, o store fala com o backend; ausente, cai no AsyncStorage local (offline).
export const apiEnabled = () => !!BASE;

// 401 = token ausente/expirado/revogado (diferente de "sem rede", que é um erro de fetch).
export class UnauthorizedError extends Error {
  readonly unauthorized = true;
  constructor() { super('Sessão expirada. Entre novamente.'); }
}
export const isUnauthorized = (e: unknown): e is UnauthorizedError => e instanceof UnauthorizedError || (e as { unauthorized?: boolean } | null)?.unauthorized === true;

async function req(path: string, init?: RequestInit) {
  const deviceId = await getDeviceId();
  const token = await getToken();
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401) {
    await clearSession(); // a UI volta pro login; a fila de scans fica intacta
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  me: (): Promise<AuthUser> => req('/auth/me'),
  bootstrap: (): Promise<{ places: Place[]; types: PlaceType[] }> => req('/bootstrap'),
  savePlace: (p: Place): Promise<Place> => req(`/places/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  deletePlace: (id: string): Promise<null> => req(`/places/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listTypes: (): Promise<PlaceType[]> => req('/types'),
  postScansBatch: (scans: ScanPayload[]): Promise<{ ids: (string | null)[]; failed?: unknown }> => req('/scans/batch', { method: 'POST', body: JSON.stringify({ scans }) }),
  ensureType: (name: string): Promise<PlaceType> => req('/types', { method: 'POST', body: JSON.stringify({ name }) }),
};
