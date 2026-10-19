import type { PlaceType } from './store.ts';
import type { Place } from './store.ts';

// Expo injects EXPO_PUBLIC_* at build time. When set, the store talks to the backend;
// when absent, it falls back to local AsyncStorage (offline, as before).
const BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const apiEnabled = () => !!BASE;

async function req(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  bootstrap: (): Promise<{ places: Place[]; types: PlaceType[] }> => req('/bootstrap'),
  savePlace: (p: Place): Promise<Place> => req(`/places/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  deletePlace: (id: string): Promise<null> => req(`/places/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listTypes: (): Promise<PlaceType[]> => req('/types'),
  ensureType: (name: string): Promise<PlaceType> => req('/types', { method: 'POST', body: JSON.stringify({ name }) }),
};
