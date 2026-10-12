import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sample } from '../matcher.ts';

export type PlaceType = { id: string; name: string };
export type Cell = { c: number; r: number };
export type Block = { id: string; name: string; color: string; cells: Cell[]; samples: Sample[]; headingRef?: number };
export type PlaceMap = { cols: number; rows: number; blocks: Block[] };
export type Place = {
  id: string; name: string; typeId: string; lat: number | null; lng: number | null; createdAt: string; map?: PlaceMap;
};
type Data = { types: PlaceType[]; places: Place[] };

const KEY = 'inroute:v1';
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ponytail: local AsyncStorage; swap these functions for API calls later.
export async function load(): Promise<Data> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { types: [], places: [] };
}
const write = (d: Data) => AsyncStorage.setItem(KEY, JSON.stringify(d));

export async function savePlace(p: Place) {
  const d = await load();
  const i = d.places.findIndex((x) => x.id === p.id);
  if (i >= 0) d.places[i] = p;
  else d.places.push(p);
  await write(d);
}

export async function deletePlace(id: string) {
  const d = await load();
  d.places = d.places.filter((p) => p.id !== id);
  await write(d);
}

export async function ensureType(name: string): Promise<PlaceType> {
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

export const hasNavigableMap = (p: Place) => !!p.map && p.map.blocks.some((b) => b.samples.length >= 4);
