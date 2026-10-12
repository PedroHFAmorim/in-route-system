import { reactive, watch } from 'vue'
import type { PlaceMap } from './grid.ts'
export type { Cell, Block, PlaceMap } from './grid.ts'

export type PlaceType = { id: string; name: string }
export type Floor = { id: string; name: string; order: number; map: PlaceMap; bg?: { dataUrl: string; opacity: number } }
export type Place = { id: string; name: string; typeId: string; lat: number | null; lng: number | null; createdAt: string; map?: PlaceMap; floors: Floor[] }
export type View = { name: 'places' } | { name: 'place'; id: string } | { name: 'floor'; placeId: string; floorId: string } | { name: 'areas'; placeId: string; floorId: string }

export const KINDS: Record<string, { label: string; color: string; icon?: string }> = {
  loja: { label: 'Loja', color: '#dfe8b8' },
  ancora: { label: 'Loja âncora', color: '#b9c97a' },
  corredor: { label: 'Corredor', color: '#f2f2f2' },
  praca: { label: 'Praça de alimentação', color: '#f9d3a8' },
  banheiro: { label: 'Banheiro', color: '#e53935', icon: '🚻' },
  escada: { label: 'Escada rolante', color: '#e53935', icon: '⇅' },
  elevador: { label: 'Elevador', color: '#e53935', icon: '🛗' },
  entrada: { label: 'Entrada', color: '#00b050', icon: '🚪' },
  servico: { label: 'Serviço (SAC etc.)', color: '#c4dff5' },
  outro: { label: 'Outro', color: '#f3c6dc' },
}

const KEY = 'inroute-web:v1'
type Data = { types: PlaceType[]; places: Place[] }
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage indisponível ou corrompido */ }
  return { types: [], places: [] }
}

export const state = reactive<Data>(load())

watch(state, () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)) }
  catch { alert('Não foi possível salvar (armazenamento cheio?). Use imagens de fundo menores.') }
}, { deep: true })

export const getPlace = (id: string) => state.places.find((p) => p.id === id)
export const typeName = (id: string) => state.types.find((t) => t.id === id)?.name ?? ''

export function ensureType(name: string): string {
  const n = name.trim()
  if (!n) return ''
  const found = state.types.find((t) => t.name.toLowerCase() === n.toLowerCase())
  if (found) return found.id
  const t = { id: newId(), name: n }
  state.types.push(t)
  return t.id
}

export function addPlace(): Place {
  const p: Place = { id: newId(), name: '', typeId: '', lat: null, lng: null, createdAt: new Date().toISOString(), floors: [] }
  state.places.push(p)
  return p
}
export const deletePlace = (id: string) => { state.places = state.places.filter((p) => p.id !== id) }

export function addFloor(p: Place, name: string, cols: number, rows: number): Floor {
  const f: Floor = { id: newId(), name, order: p.floors.length, map: { cols, rows, blocks: [] } }
  p.floors.push(f)
  return f
}

export function moveFloor(p: Place, i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= p.floors.length) return
  const [f] = p.floors.splice(i, 1)
  p.floors.splice(j, 0, f)
  p.floors.forEach((x, k) => (x.order = k))
}

export function exportPlace(p: Place) {
  const blob = new Blob([JSON.stringify({ ...p, typeName: typeName(p.typeId) }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.name || 'lugar'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// Aceita JSON exportado pelo web (com floors) ou lugar do mobile (só `map`, vira um andar).
export async function importPlace(file: File): Promise<Place> {
  const j = JSON.parse(await file.text())
  if (!j || typeof j.name !== 'string') throw new Error('JSON inválido')
  const floors: Floor[] = Array.isArray(j.floors) ? j.floors : j.map ? [{ id: newId(), name: 'Piso 1', order: 0, map: j.map }] : []
  const p: Place = {
    id: newId(), name: j.name, typeId: j.typeName ? ensureType(j.typeName) : '', lat: j.lat ?? null, lng: j.lng ?? null,
    createdAt: j.createdAt ?? new Date().toISOString(), floors,
  }
  state.places.push(p)
  return p
}
