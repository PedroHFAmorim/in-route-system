<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { bbox, polyCells, resizeMap, simplify, type Block, type Pt } from './grid.ts'
import { KINDS, newId, type Place, type View } from './store.ts'

const props = defineProps<{ place: Place; floorId: string }>()
const emit = defineEmits<{ go: [v: View] }>()

const CELL = 16
const floor = computed(() => props.place.floors.find((f) => f.id === props.floorId)!)
const map = computed(() => floor.value.map)

type Tool = 'draw' | 'rect' | 'select' | 'move'
const TOOLS: [Tool, string][] = [['draw', 'Desenhar'], ['rect', 'Retângulo'], ['select', 'Selecionar'], ['move', 'Mover']]
const tool = ref<Tool>('draw')
const selId = ref('')
const sel = computed(() => map.value.blocks.find((b) => b.id === selId.value))
const zoom = ref(1)
const newKind = ref('loja')
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
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
  if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
  else if (!pts.value.length) return
  else if (e.key === 'Enter') fechar()
  else if (e.key === 'Escape') pts.value = []
  else if (e.key === 'Backspace') { e.preventDefault(); pts.value.pop() }
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
const px = computed(() => 1 / (CELL * zoom.value)) // 1 pixel de tela em unidades da grade

// ---- desenho / edição ----
const pts = ref<Pt[]>([])
const mouse = ref<Pt | null>(null)
let pan: { x: number; y: number; sl: number; st: number } | null = null
// press: botão apertado no 'draw' (sem polígono em andamento) ou 'rect'; free: já virou traço livre
let press: { cx: number; cy: number; p: Pt; free: boolean } | null = null
const live = ref(false) // traço livre/retângulo em andamento (esconde as alças)
let drag: { vert: number; last: Pt; moved: boolean } | null = null

function ptAt(e: PointerEvent): Pt {
  const r = svg.value!.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * map.value.cols, y: ((e.clientY - r.top) / r.height) * map.value.rows }
}
const recalc = (b: Block) => { if (b.poly) b.cells = polyCells(b.poly, map.value.cols, map.value.rows) }

function down(e: PointerEvent) {
  svg.value!.setPointerCapture(e.pointerId)
  if (e.button === 1 || tool.value === 'move') {
    pan = { x: e.clientX, y: e.clientY, sl: scroller.value!.scrollLeft, st: scroller.value!.scrollTop }
    return
  }
  if (e.button !== 0) return
  if (tool.value === 'select') { selId.value = ''; return }
  const p = ptAt(e)
  if (tool.value === 'rect' || !pts.value.length) { press = { cx: e.clientX, cy: e.clientY, p, free: false }; return }
  const a = pts.value[0]
  if (a && pts.value.length >= 3 && Math.hypot(a.x - p.x, a.y - p.y) < 8 * px.value) fechar()
  else pts.value.push(p)
}
function polyDown(e: PointerEvent, b: Block, vert = -1) {
  if (tool.value !== 'select' || e.button !== 0) return
  e.stopPropagation()
  svg.value!.setPointerCapture(e.pointerId)
  selId.value = b.id
  if (b.poly) drag = { vert, last: ptAt(e), moved: false }
}
function move(e: PointerEvent) {
  if (pan) { scroller.value!.scrollLeft = pan.sl - (e.clientX - pan.x); scroller.value!.scrollTop = pan.st - (e.clientY - pan.y); return }
  const p = ptAt(e)
  mouse.value = p
  if (press) {
    const d = Math.hypot(e.clientX - press.cx, e.clientY - press.cy)
    if (tool.value === 'rect') {
      if (d > 4) { live.value = true; const a = press.p; pts.value = [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }] }
    } else {
      if (!press.free && d > 4) { press.free = true; live.value = true; pts.value = [press.p] }
      const l = pts.value[pts.value.length - 1]
      if (press.free && Math.hypot(p.x - l.x, p.y - l.y) >= 4 * px.value) pts.value.push(p)
    }
    return
  }
  if (!drag || !sel.value?.poly) return
  if (!drag.moved) { snap(); drag.moved = true }
  if (drag.vert >= 0) sel.value.poly[drag.vert] = p
  else {
    const dx = p.x - drag.last.x, dy = p.y - drag.last.y
    sel.value.poly = sel.value.poly.map((v) => ({ x: v.x + dx, y: v.y + dy }))
  }
  drag.last = p
}
function up(e: PointerEvent) {
  pan = null
  if (press) {
    const pr = press
    press = null
    live.value = false
    if (tool.value === 'rect') {
      if (Math.hypot(e.clientX - pr.cx, e.clientY - pr.cy) < 4) pts.value = []
      else fechar()
    } else if (pr.free) {
      pts.value = simplify(pts.value, 1.5 * px.value)
      if (pts.value.length >= 3) fechar(); else pts.value = []
    } else pts.value.push(pr.p)
    return
  }
  if (drag?.moved && sel.value) recalc(sel.value)
  drag = null
}
function dbl() {
  if (tool.value !== 'draw') return
  pts.value.pop() // o 2º clique do duplo clique repete o vértice
  fechar()
}
function fechar() {
  if (pts.value.length < 3) return
  snap()
  const k = KINDS[newKind.value]
  const n = map.value.blocks.filter((b) => b.kind === newKind.value).length + 1
  const poly = pts.value.map((v) => ({ ...v }))
  const b: Block = { id: newId(), name: `${k.label} ${n}`, kind: newKind.value, color: k.color, poly, cells: polyCells(poly, map.value.cols, map.value.rows), samples: [] }
  map.value.blocks.push(b)
  selId.value = b.id
  pts.value = []
}

// ---- áreas ----
function trocaKind() {
  if (sel.value?.kind) sel.value.color = KINDS[sel.value.kind].color
}
function excluirArea() {
  if (!sel.value || !confirm(`Excluir a área "${sel.value.name}"?`)) return
  snap()
  floor.value.map = { ...map.value, blocks: map.value.blocks.filter((b) => b.id !== selId.value) }
  selId.value = ''
}

// rótulos: nome no centro (média dos vértices p/ polígono, bbox p/ células), só se couber
const labels = computed(() =>
  map.value.blocks.flatMap((b) => {
    let x0: number, y0: number, x1: number, y1: number, x: number, y: number
    if (b.poly?.length) {
      const xs = b.poly.map((v) => v.x), ys = b.poly.map((v) => v.y)
      x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys)
      x = xs.reduce((a, v) => a + v, 0) / xs.length; y = ys.reduce((a, v) => a + v, 0) / ys.length
    } else {
      const bb = bbox(b)
      if (!bb) return []
      x0 = bb.c0; y0 = bb.r0; x1 = bb.c1 + 1; y1 = bb.r1 + 1; x = (x0 + x1) / 2; y = (y0 + y1) / 2
    }
    const w = x1 - x0, h = y1 - y0
    const icon = b.kind ? KINDS[b.kind]?.icon : undefined
    const fit = (len: number) => Math.min(1.5, w / (len * 0.6), h * 0.9)
    const min = 7 * px.value
    let text = icon ? `${icon} ${b.name}` : b.name
    let f = fit(text.length)
    if (f < min && icon) { text = icon; f = fit(2) }
    return f < min ? [] : [{ id: b.id, text, f, x, y }]
  }),
)
const pts2 = (a: Pt[]) => a.map((v) => `${v.x},${v.y}`).join(' ')
const rubber = computed(() => pts.value.length && mouse.value ? [pts.value[pts.value.length - 1], mouse.value] : [])

// ---- imagem de fundo: reduz, guarda em floor.bg e adapta a grade à proporção ----
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
    snap()
    floor.value.bg = { dataUrl: cv.toDataURL('image/jpeg', 0.8), opacity: floor.value.bg?.opacity ?? 0.5 }
    const cols = map.value.blocks.length ? map.value.cols : 100
    const m = resizeMap(map.value, cols, Math.max(1, Math.round((cols * cv.height) / cv.width)))
    m.blocks.forEach(recalc)
    floor.value.map = m
    URL.revokeObjectURL(img.src)
    nextTick(fit)
  }
  img.src = URL.createObjectURL(f)
}
</script>

<template>
  <div v-if="floor" class="row g-2 ed-root">
    <div class="col-lg-9 d-flex flex-column ed-col">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2" style="flex: none">
        <button class="btn btn-sm btn-outline-secondary" @click="emit('go', { name: 'place', id: place.id })">← Voltar</button>
        <select class="form-select form-select-sm w-auto" :value="floorId" @change="emit('go', { name: 'areas', placeId: place.id, floorId: ($event.target as HTMLSelectElement).value })">
          <option v-for="f in place.floors" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <div class="btn-group btn-group-sm">
          <button v-for="[t, l] in TOOLS" :key="t" class="btn" :class="tool === t ? 'btn-primary' : 'btn-outline-primary'" @click="tool = t; pts = []; press = null; live = false">{{ l }}</button>
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
          :style="{ display: 'block', touchAction: 'none', cursor: tool === 'move' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }"
          @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @dblclick="dbl" @auxclick.prevent
        >
          <rect :width="map.cols" :height="map.rows" fill="#fff" />
          <image v-if="floor.bg" :href="floor.bg.dataUrl" :opacity="floor.bg.opacity" :width="map.cols" :height="map.rows" preserveAspectRatio="xMidYMid meet" />
          <template v-for="b in map.blocks" :key="b.id">
            <polygon v-if="b.poly" :points="pts2(b.poly)" :fill="b.color" fill-opacity=".55" stroke="#222" :stroke-width="(b.id === selId ? 2 : 1) * px" stroke-linejoin="round" :style="{ cursor: tool === 'select' ? 'move' : undefined }" @pointerdown="polyDown($event, b)" />
            <g v-else @pointerdown="polyDown($event, b)">
              <rect v-for="x in b.cells" :key="x.r * 100000 + x.c" :x="x.c" :y="x.r" width="1" height="1" :fill="b.color" stroke="#000" stroke-opacity=".15" stroke-width=".03" />
            </g>
          </template>
          <text v-for="l in labels" :key="l.id" :x="l.x" :y="l.y" :font-size="l.f" text-anchor="middle" dominant-baseline="central" fill="#222" pointer-events="none" style="user-select: none">{{ l.text }}</text>
          <template v-if="tool === 'select' && sel?.poly">
            <circle v-for="(v, i) in sel.poly" :key="i" :cx="v.x" :cy="v.y" :r="4 * px" fill="#fff" stroke="#2557D6" :stroke-width="2 * px" style="cursor: pointer" @pointerdown="polyDown($event, sel!, i)" />
          </template>
          <template v-if="pts.length">
            <polyline :points="pts2([...pts, ...(mouse ? [mouse] : [])])" fill="none" stroke="#2557D6" :stroke-width="2 * px" pointer-events="none" />
            <polyline :points="pts2(rubber)" fill="none" stroke="#2557D6" :stroke-width="2 * px" stroke-dasharray="4 3" :style="{ strokeDasharray: `${4 * px} ${3 * px}` }" pointer-events="none" />
            <circle v-for="(v, i) in (live ? [] : pts)" :key="'d' + i" :cx="v.x" :cy="v.y" :r="(i ? 3 : 5) * px" :fill="i ? '#2557D6' : '#18C29C'" pointer-events="none" />
          </template>
        </svg>
      </div>
      <div class="small text-muted mt-1" style="flex: none">Ctrl+roda: zoom · botão do meio: arrastar · Ctrl+Z: desfazer · Desenhar: arraste p/ traço livre ou clique p/ vértices (fechar no 1º ponto, duplo clique ou Enter) · Retângulo: arraste · Esc cancela · Backspace remove o último</div>
    </div>

    <div class="col-lg-3 ed-col ed-side">
      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title">Planta de fundo</h6>
        <label class="btn btn-sm btn-outline-secondary">Importar planta<input type="file" accept="image/*" hidden @change="carregarPlanta" /></label>
        <template v-if="floor.bg">
          <input v-model.number="floor.bg.opacity" type="range" min="0" max="1" step=".05" class="form-range mt-2" />
          <button class="btn btn-sm btn-outline-danger" @click="floor.bg = undefined">Remover planta</button>
        </template>
        <div class="form-text">Ao importar, o mapa se ajusta à proporção da imagem.</div>
      </div></div>

      <div class="card"><div class="card-body">
        <h6 class="card-title">Áreas</h6>
        <label class="form-label small mb-0">Tipo da nova área</label>
        <select v-model="newKind" class="form-select form-select-sm mb-2"><option v-for="(k, id) in KINDS" :key="id" :value="id">{{ k.label }}</option></select>
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
          <button class="btn btn-sm btn-outline-danger" @click="excluirArea">Excluir área</button>
        </template>
        <div class="form-text mt-2">Selecionar: clique na área, arraste os pontos para ajustar ou o corpo para mover. Áreas do editor de grade aparecem, mas só se editam lá.</div>
      </div></div>
    </div>
  </div>
</template>
