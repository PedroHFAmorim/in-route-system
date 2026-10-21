import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { Sample } from '../matcher.ts';
import { api, apiEnabled } from './api.ts';
import { parsePlaceJson } from './importer.ts';
import { canNavigate } from './logic.ts';

export type PlaceType = { id: string; name: string };
export type Cell = { c: number; r: number };
export type Block = { id: string; name: string; color: string; cells: Cell[]; samples: Sample[]; headingRef?: number; poly?: { x: number; y: number }[]; kind?: string };
export type PlaceMap = { cols: number; rows: number; blocks: Block[]; bg?: { uri: string; opacity: number }; azimuth0?: number };
export type Place = {
  id: string; name: string; typeId: string; lat: number | null; lng: number | null; address?: string; createdAt: string; map?: PlaceMap;
};
type Data = { types: PlaceType[]; places: Place[] };

const KEY = 'inroute:v1';
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Backend (Postgres via API) when EXPO_PUBLIC_API_URL is set; local AsyncStorage otherwise.
export async function load(): Promise<Data> {
  if (apiEnabled()) return api.bootstrap();
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { types: [], places: [] };
}
const write = (d: Data) => AsyncStorage.setItem(KEY, JSON.stringify(d));

export async function savePlace(p: Place) {
  if (apiEnabled()) { await api.savePlace(p); return; }
  const d = await load();
  const i = d.places.findIndex((x) => x.id === p.id);
  if (i >= 0) d.places[i] = p;
  else d.places.push(p);
  await write(d);
}

export async function deletePlace(id: string) {
  if (apiEnabled()) { await api.deletePlace(id); return; }
  const d = await load();
  const uri = d.places.find((p) => p.id === id)?.map?.bg?.uri;
  if (uri) try { new File(uri).delete(); } catch {}
  d.places = d.places.filter((p) => p.id !== id);
  await write(d);
}

export async function ensureType(name: string): Promise<PlaceType> {
  if (apiEnabled()) return api.ensureType(name.trim());
  const d = await load();
  const n = name.trim();
  const found = d.types.find((t) => t.name.toLowerCase() === n.toLowerCase());
  if (found) return found;
  const t = { id: newId(), name: n };
  d.types.push(t);
  await write(d);
  return t;
}

export const listTypes = async () => (await load()).types;

// Basta uma leitura em um bloco. Leituras extras só melhoram a precisão (ver mapQualityLabel); não são exigidas.
export const hasNavigableMap = (p: Place) => !!p.map && canNavigate(p.map.blocks);

// Imports the JSON exported by the web editor: one mobile Place per floor with blocks.
export async function importPlaces(json: unknown): Promise<Place[]> {
  const sks = parsePlaceJson(json);
  const type = sks.find((s) => s.typeName)?.typeName;
  const typeId = type ? (await ensureType(type)).id : '';
  const created: Place[] = [];
  for (const s of sks) {
    const id = newId();
    const map = s.map;
    if (s.bgData) {
      try {
        const f = new File(Paths.document, `plan-${id}.${s.bgData.ext}`);
        f.write(Uint8Array.from(atob(s.bgData.b64), (ch) => ch.charCodeAt(0)));
        map.bg = { uri: f.uri, opacity: s.bgData.opacity };
      } catch {
        throw new Error('Falha ao salvar a imagem da planta');
      }
    }
    const p: Place = { id, name: s.name, typeId, lat: s.lat, lng: s.lng, createdAt: new Date().toISOString(), map };
    await savePlace(p);
    created.push(p);
  }
  return created;
}
