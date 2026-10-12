<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { bbox, blockAt, eraseCells, paintCells, rectCells, resizeMap, type Cell } from './grid.ts'
import { KINDS, newId, type Place, type View } from './store.ts'

const props = defineProps<{ place: Place; floorId: string }>()
const emit = defineEmits<{ go: [v: View] }>()

const CELL = 16
const floor = computed(() => props.place.floors.find((f) => f.id === props.floorId)!)
const map = computed(() => floor.value.map)

type Tool = 'rect' | 'brush' | 'erase' | 'select' | 'move'
const TOOLS: [Tool, string][] = [['rect', 'Retângulo'], ['brush', 'Pincel'], ['erase', 'Borracha'], ['select', 'Selecionar'], ['move', 'Mover']]
const tool = ref<Tool>('rect')
const selId = ref('')
const sel = computed(() => map.value.blocks.find((b) => b.id === selId.value))
const zoom = ref(1)
const newKind = ref('loja')
const size = reactive({ cols: map.value.cols, rows: map.value.rows })
const scroller = ref<HTMLElement>()
const svg = ref<SVGSVGElement>()

// ---- desfazer (snapshots JSON do map) ----
const undoStack: string[] = []
function snap() {
  undoStack.push(JSON.stringify(map.value))
  if (undoStack.length > 50) undoStack.shift()
}
function undo() {
  const s = undoStack.pop()
  if (s) floor.value.map = JSON.parse(s)
}
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.ctrlKey && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); undo() }
}
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('resize', fit); fit() })
onUnmounted(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', fit) })

// ---- zoom / pan ----
const setZoom = (z: number) => (zoom.value = Math.min(6, Math.max(0.1, z)))
function fit() {
  const s = scroller.value
  if (s) setZoom(Math.min((s.clientWidth - 4) / (map.value.cols * CELL), (s.clientHeight - 4) / (map.value.rows * CELL)))
}
const onWheel = (e: WheelEvent) => { if (e.ctrlKey) setZoom(zoom.value * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }

// ---- desenho ----
const drag = ref<{ a: Cell; b: Cell; brush: Cell[] } | null>(null)
let pan: { x: number; y: number; sl: number; st: number } | null = null

function cellAt(e: PointerEvent): Cell {
  const r = svg.value!.getBoundingClientRect()
  const c = Math.floor(((e.clientX - r.left) / r.width) * map.value.cols)
  const row = Math.floor(((e.clientY - r.top) / r.height) * map.value.rows)
  return { c: Math.min(map.value.cols - 1, Math.max(0, c)), r: Math.min(map.value.rows - 1, Math.max(0, row)) }
}
function down(e: PointerEvent) {
  svg.value!.setPointerCapture(e.pointerId)
  if (e.button === 1 || tool.value === 'move') {
    pan = { x: e.clientX, y: e.clientY, sl: scroller.value!.scrollLeft, st: scroller.value!.scrollTop }
    return
  }
  if (e.button !== 0) return
  const p = cellAt(e)
  if (tool.value === 'select') { selId.value = blockAt(map.value, p.c, p.r)?.id ?? ''; return }
  if (tool.value !== 'erase' && !sel.value) { alert('Crie ou selecione um bloco antes de pintar.'); return }
  drag.value = { a: p, b: p, brush: [p] }
}
function move(e: PointerEvent) {
  if (pan) { scroller.value!.scrollLeft = pan.sl - (e.clientX - pan.x); scroller.value!.scrollTop = pan.st - (e.clientY - pan.y); return }
  const d = drag.value
  if (!d) return
  const prev = d.b
  d.b = cellAt(e)
  if (tool.value !== 'brush') return
  // fill the line from the previous cell so fast drags leave no gaps
  const n = Math.max(Math.abs(d.b.c - prev.c), Math.abs(d.b.r - prev.r))
  for (let i = 1; i <= n; i++) {
    const p = { c: Math.round(prev.c + ((d.b.c - prev.c) * i) / n), r: Math.round(prev.r + ((d.b.r - prev.r) * i) / n) }
    if (!d.brush.some((x) => x.c === p.c && x.r === p.r)) d.brush.push(p)
  }
}
function up() {
  pan = null
  const d = drag.value
  drag.value = null
  if (!d) return
  const cells = tool.value === 'brush' ? d.brush : rectCells(d.a, d.b)
  snap()
  floor.value.map = tool.value === 'erase' ? eraseCells(map.value, cells) : paintCells(map.value, selId.value, cells)
}
const preview = computed(() => (drag.value ? (tool.value === 'brush' ? drag.value.brush : rectCells(drag.value.a, drag.value.b)) : []))

// ---- blocos ----
function novoBloco() {
  snap()
  const k = KINDS[newKind.value]
  const n = map.value.blocks.filter((b) => b.kind === newKind.value).length + 1
  const b = { id: newId(), name: `${k.label} ${n}`, kind: newKind.value, color: k.color, cells: [], samples: [] }
  map.value.blocks.push(b)
  selId.value = b.id
}
function trocaKind() {
  if (sel.value?.kind) sel.value.color = KINDS[sel.value.kind].color
}
function excluirBloco() {
  if (!sel.value || !confirm(`Excluir o bloco "${sel.value.name}"?`)) return
  snap()
  floor.value.map = { ...map.value, blocks: map.value.blocks.filter((b) => b.id !== selId.value) }
  selId.value = ''
}
function aplicarTamanho() {
  const cols = Math.max(1, size.cols | 0), rows = Math.max(1, size.rows | 0)
  snap()
  floor.value.map = resizeMap(map.value, cols, rows)
  size.cols = cols; size.rows = rows
}

// rótulos: nome no centro da bbox, só se couber
const labels = computed(() =>
  map.value.blocks.flatMap((b) => {
    const bb = bbox(b)
    if (!bb) return []
    const w = bb.c1 - bb.c0 + 1, h = bb.r1 - bb.r0 + 1
    const icon = b.kind ? KINDS[b.kind]?.icon : undefined
    const fit = (len: number) => Math.min(1.5, w / (len * 0.6), h * 0.9)
    const min = 7 / (CELL * zoom.value)
    let text = icon ? `${icon} ${b.name}` : b.name
    let f = fit(text.length)
    if (f < min && icon) { text = icon; f = fit(2) }
    return f < min ? [] : [{ id: b.id, text, f, x: (bb.c0 + bb.c1 + 1) / 2, y: (bb.r0 + bb.r1 + 1) / 2 }]
  }),
)
const selBox = computed(() => (sel.value ? bbox(sel.value) : null))

// ---- imagem de fundo ----
function carregarPlanta(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const img = new Image()
  img.onload = () => {
    const s = Math.min(1, 2000 / Math.max(img.width, img.height)) // reduz p/ caber no localStorage
    const cv = document.createElement('canvas')
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s)
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
    floor.value.bg = { dataUrl: cv.toDataURL('image/jpeg', 0.8), opacity: floor.value.bg?.opacity ?? 0.5 }
    URL.revokeObjectURL(img.src)
  }
  img.src = URL.createObjectURL(f)
}
</script>

<template>
  <div v-if="floor" class="row g-2 ed-root">
    <div class="col-lg-9 d-flex flex-column ed-col">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2" style="flex: none">
        <button class="btn btn-sm btn-outline-secondary" @click="emit('go', { name: 'place', id: place.id })">← Voltar</button>
        <select class="form-select form-select-sm w-auto" :value="floorId" @change="emit('go', { name: 'floor', placeId: place.id, floorId: ($event.target as HTMLSelectElement).value })">
          <option v-for="f in place.floors" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <div class="btn-group btn-group-sm">
          <button v-for="[t, l] in TOOLS" :key="t" class="btn" :class="tool === t ? 'btn-primary' : 'btn-outline-primary'" @click="tool = t">{{ l }}</button>
        </div>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Diminuir" @click="setZoom(zoom / 1.25)">−</button>
          <button class="btn btn-outline-secondary" @click="fit">Ajustar</button>
          <button class="btn btn-outline-secondary" title="Aumentar" @click="setZoom(zoom * 1.25)">+</button>
        </div>
        <span class="small text-muted">{{ Math.round(zoom * 100) }}%</span>
        <button class="btn btn-sm btn-outline-secondary" :disabled="!undoStack.length" @click="undo">Desfazer</button>
      </div>
      <div ref="scroller" class="border bg-white ed-scroll" style="overflow: auto" @wheel="onWheel">
        <svg
          ref="svg" :width="map.cols * CELL * zoom" :height="map.rows * CELL * zoom" :viewBox="`0 0 ${map.cols} ${map.rows}`"
          :style="{ display: 'block', touchAction: 'none', cursor: tool === 'move' ? 'grab' : tool === 'select' ? 'pointer' : 'crosshair' }"
          @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @auxclick.prevent
        >
          <defs>
            <pattern id="g" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#000" stroke-opacity=".12" stroke-width=".03" /></pattern>
          </defs>
          <rect :width="map.cols" :height="map.rows" fill="#fff" />
          <image v-if="floor.bg" :href="floor.bg.dataUrl" :opacity="floor.bg.opacity" :width="map.cols" :height="map.rows" preserveAspectRatio="xMidYMid meet" />
          <template v-for="b in map.blocks" :key="b.id">
            <rect v-for="x in b.cells" :key="x.r * 100000 + x.c" :x="x.c" :y="x.r" width="1" height="1" :fill="b.color" stroke="#000" stroke-opacity=".15" stroke-width=".03" />
          </template>
          <rect :width="map.cols" :height="map.rows" fill="url(#g)" pointer-events="none" />
          <rect v-for="x in preview" :key="'p' + x.r * 100000 + x.c" :x="x.c" :y="x.r" width="1" height="1" :fill="tool === 'erase' ? '#dc3545' : (sel?.color ?? '#0d6efd')" fill-opacity=".6" pointer-events="none" />
          <rect v-if="selBox" :x="selBox.c0" :y="selBox.r0" :width="selBox.c1 - selBox.c0 + 1" :height="selBox.r1 - selBox.r0 + 1" fill="none" stroke="#0d6efd" stroke-width=".15" stroke-dasharray=".5 .3" pointer-events="none" />
          <text v-for="l in labels" :key="l.id" :x="l.x" :y="l.y" :font-size="l.f" text-anchor="middle" dominant-baseline="central" fill="#222" pointer-events="none" style="user-select: none">{{ l.text }}</text>
        </svg>
      </div>
      <div class="small text-muted mt-1" style="flex: none">Ctrl+roda: zoom · botão do meio: arrastar · Ctrl+Z: desfazer</div>
    </div>

    <div class="col-lg-3 ed-col ed-side">
      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title">Blocos</h6>
        <div class="input-group input-group-sm mb-2">
          <select v-model="newKind" class="form-select"><option v-for="(k, id) in KINDS" :key="id" :value="id">{{ k.label }}</option></select>
          <button class="btn btn-success" @click="novoBloco">Novo bloco</button>
        </div>
        <div class="list-group mb-2" style="max-height: 220px; overflow: auto">
          <button v-for="b in map.blocks" :key="b.id" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-1" :class="{ active: b.id === selId }" @click="selId = b.id">
            <span class="border" :style="{ background: b.color, width: '14px', height: '14px', flex: 'none' }" />
            <span class="text-truncate">{{ b.name }}</span>
            <small class="ms-auto opacity-75">{{ b.kind ? KINDS[b.kind]?.label : '' }}</small>
          </button>
        </div>
        <template v-if="sel">
          <label class="form-label small mb-0">Nome</label>
          <input v-model="sel.name" class="form-control form-control-sm mb-2" />
          <label class="form-label small mb-0">Tipo</label>
          <select v-model="sel.kind" class="form-select form-select-sm mb-2" @change="trocaKind"><option v-for="(k, id) in KINDS" :key="id" :value="id">{{ k.label }}</option></select>
          <label class="form-label small mb-0">Cor</label>
          <input v-model="sel.color" type="color" class="form-control form-control-color mb-2" />
          <button class="btn btn-sm btn-outline-danger" @click="excluirBloco">Excluir bloco</button>
        </template>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title">Grade</h6>
        <div class="input-group input-group-sm">
          <input v-model.number="size.cols" type="number" min="1" class="form-control" title="Colunas" />
          <span class="input-group-text">×</span>
          <input v-model.number="size.rows" type="number" min="1" class="form-control" title="Linhas" />
          <button class="btn btn-outline-secondary" @click="aplicarTamanho">Aplicar</button>
        </div>
        <div class="form-text">Células fora do novo limite são descartadas.</div>
      </div></div>

      <div class="card"><div class="card-body">
        <h6 class="card-title">Planta de fundo</h6>
        <label class="btn btn-sm btn-outline-secondary">Carregar planta<input type="file" accept="image/*" hidden @change="carregarPlanta" /></label>
        <template v-if="floor.bg">
          <input v-model.number="floor.bg.opacity" type="range" min="0" max="1" step=".05" class="form-range mt-2" />
          <button class="btn btn-sm btn-outline-danger" @click="floor.bg = undefined">Remover planta</button>
        </template>
      </div></div>
    </div>
  </div>
</template>
