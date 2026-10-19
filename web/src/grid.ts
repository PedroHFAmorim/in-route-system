// Lógica pura de grade (sem Vue). Formatos compatíveis com mobile/src/store.ts.
export type Cell = { c: number; r: number }
export type Pt = { x: number; y: number }
export type Block = { id: string; name: string; color: string; cells: Cell[]; samples: unknown[]; headingRef?: number; kind?: string; poly?: Pt[] }
export type PlaceMap = { cols: number; rows: number; blocks: Block[] }

export function rectCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = []
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push({ c, r })
  return out
}

const key = (x: Cell) => x.r * 100000 + x.c
const inside = (m: PlaceMap, x: Cell) => x.c >= 0 && x.r >= 0 && x.c < m.cols && x.r < m.rows

export function eraseCells(m: PlaceMap, cells: Cell[]): PlaceMap {
  const del = new Set(cells.map(key))
  return { ...m, blocks: m.blocks.map((b) => ({ ...b, cells: b.cells.filter((x) => !del.has(key(x))) })) }
}

// Pinta no bloco; células que eram de outro bloco passam para ele.
export function paintCells(m: PlaceMap, blockId: string, cells: Cell[]): PlaceMap {
  const valid = cells.filter((x) => inside(m, x))
  const base = eraseCells(m, valid)
  const add = new Map(valid.map((x) => [key(x), x]))
  return { ...base, blocks: base.blocks.map((b) => (b.id === blockId ? { ...b, cells: [...b.cells, ...add.values()] } : b)) }
}

export function resizeMap(m: PlaceMap, cols: number, rows: number): PlaceMap {
  const next = { ...m, cols, rows }
  return { ...next, blocks: m.blocks.map((b) => ({ ...b, cells: b.cells.filter((x) => inside(next, x)) })) }
}

export function blockAt(m: PlaceMap, c: number, r: number): Block | undefined {
  return m.blocks.find((b) => b.cells.some((x) => x.c === c && x.r === r))
}

export function bbox(b: Block): { c0: number; r0: number; c1: number; r1: number } | null {
  if (!b.cells.length) return null
  let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity
  for (const x of b.cells) { c0 = Math.min(c0, x.c); r0 = Math.min(r0, x.r); c1 = Math.max(c1, x.c); r1 = Math.max(r1, x.r) }
  return { c0, r0, c1, r1 }
}

// Células cujo centro está dentro do polígono (par-ímpar), limitadas à grade.
export function polyCells(poly: Pt[], cols: number, rows: number): Cell[] {
  const out: Cell[] = []
  if (poly.length < 3) return out
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = c + 0.5, py = r + 0.5
      let ins = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) ins = !ins
      }
      if (ins) out.push({ c, r })
    }
  return out
}

// Ramer–Douglas–Peucker (caminho aberto): remove pontos a menos de `tol` da reta entre os extremos.
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice()
  const a = pts[0], b = pts[pts.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  let max = -1, k = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const d = len ? Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len : Math.hypot(p.x - a.x, p.y - a.y)
    if (d > max) { max = d; k = i }
  }
  if (max <= tol) return [a, b]
  return [...simplify(pts.slice(0, k + 1), tol).slice(0, -1), ...simplify(pts.slice(k), tol)]
}

// Insere vértice em i (imutável).
export const insertVert = (poly: Pt[], i: number, p: Pt): Pt[] => [...poly.slice(0, i), p, ...poly.slice(i)]
// Remove o vértice i; mantém o polígono se ficaria com < 3.
export const removeVert = (poly: Pt[], i: number): Pt[] => (poly.length > 3 ? poly.filter((_, k) => k !== i) : poly)
