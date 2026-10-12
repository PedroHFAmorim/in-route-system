import assert from 'node:assert'
import { rectCells, paintCells, eraseCells, resizeMap, blockAt, bbox, polyCells, simplify } from './grid.ts'
import type { PlaceMap } from './grid.ts'

const blk = (id: string) => ({ id, name: id, color: '#fff', cells: [], samples: [] })
const m0: PlaceMap = { cols: 10, rows: 8, blocks: [blk('A'), blk('B')] }

assert.equal(rectCells({ c: 3, r: 2 }, { c: 1, r: 1 }).length, 6)

let m = paintCells(m0, 'A', rectCells({ c: 0, r: 0 }, { c: 2, r: 1 }))
assert.equal(m.blocks[0].cells.length, 6)
assert.equal(m0.blocks[0].cells.length, 0, 'não muta o original')
assert.equal(blockAt(m, 1, 1)?.id, 'A')
assert.equal(blockAt(m, 5, 5), undefined)

// roubar células de outro bloco
m = paintCells(m, 'B', rectCells({ c: 1, r: 0 }, { c: 3, r: 0 }))
assert.equal(blockAt(m, 1, 0)?.id, 'B')
assert.equal(m.blocks[0].cells.length, 4)
assert.equal(m.blocks[1].cells.length, 3)
// repintar não duplica; fora da grade é ignorado
m = paintCells(m, 'B', [{ c: 1, r: 0 }, { c: 99, r: 0 }])
assert.equal(m.blocks[1].cells.length, 3)

m = eraseCells(m, rectCells({ c: 0, r: 0 }, { c: 1, r: 1 }))
assert.equal(blockAt(m, 0, 0), undefined)
assert.equal(blockAt(m, 1, 0), undefined)
assert.equal(blockAt(m, 2, 0)?.id, 'B')

m = resizeMap(m, 3, 1)
assert.deepEqual([m.cols, m.rows], [3, 1])
assert.ok(m.blocks.every((b) => b.cells.every((x) => x.c < 3 && x.r < 1)))
assert.equal(blockAt(m, 2, 0)?.id, 'B')
assert.deepEqual(bbox(m.blocks[1]), { c0: 2, r0: 0, c1: 2, r1: 0 })
assert.equal(bbox(blk('Z')), null)


const sq = polyCells([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 1, y: 3 }], 10, 8)
assert.equal(sq.length, 6)
assert.ok(sq.every((x) => x.c >= 1 && x.c <= 3 && x.r >= 1 && x.r <= 2))
const tri = polyCells([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], 10, 8)
assert.equal(tri.length, 6) // centros com x+y < 4
assert.equal(polyCells([{ x: -5, y: -5 }, { x: 50, y: -5 }, { x: 50, y: 50 }, { x: -5, y: 50 }], 3, 2).length, 6, 'recorta na grade')
assert.equal(polyCells([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5, 5).length, 0)
assert.equal(simplify([{ x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 2, y: 0 }, { x: 3, y: 0 }], 0.5).length, 2, 'colineares caem')
assert.equal(simplify([{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 4, y: 0 }], 0.5).length, 3, 'canto fica')
console.log('grid OK')
