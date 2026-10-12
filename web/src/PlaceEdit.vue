<script setup lang="ts">
import { reactive, ref } from 'vue'
import { addFloor, ensureType, exportPlace, moveFloor, state, typeName, type Place, type View } from './store.ts'

const props = defineProps<{ place: Place }>()
const emit = defineEmits<{ go: [v: View] }>()

const tipo = ref(typeName(props.place.typeId))
const nf = reactive({ name: '' })

const num = (e: Event) => ((e.target as HTMLInputElement).value === '' ? null : Number((e.target as HTMLInputElement).value))
const salvarTipo = () => { props.place.typeId = ensureType(tipo.value) }

function geo() {
  navigator.geolocation.getCurrentPosition(
    (pos) => { props.place.lat = pos.coords.latitude; props.place.lng = pos.coords.longitude },
    (err) => alert('Não foi possível obter a localização: ' + err.message),
  )
}
function adicionar() {
  const f = addFloor(props.place, nf.name.trim() || `Piso ${props.place.floors.length + 1}`, 100, 60)
  nf.name = ''
  emit('go', { name: 'areas', placeId: props.place.id, floorId: f.id })
}
function excluir(i: number) {
  if (confirm(`Excluir o andar "${props.place.floors[i].name}"?`)) {
    props.place.floors.splice(i, 1)
    props.place.floors.forEach((x, k) => (x.order = k))
  }
}
</script>

<template>
  <div class="row g-3">
    <div class="col-lg-5">
      <div class="card"><div class="card-body">
        <h5 class="card-title">Lugar</h5>
        <label class="form-label">Nome</label>
        <input v-model="place.name" class="form-control mb-2" placeholder="Ex.: Shopping Center" />
        <label class="form-label">Tipo de lugar</label>
        <input v-model="tipo" class="form-control mb-2" list="tipos" placeholder="Escolha ou digite um novo" @change="salvarTipo" @blur="salvarTipo" />
        <datalist id="tipos"><option v-for="t in state.types" :key="t.id" :value="t.name" /></datalist>
        <div class="row g-2">
          <div class="col"><label class="form-label">Latitude</label>
            <input type="number" step="any" class="form-control" :value="place.lat ?? ''" @input="place.lat = num($event)" /></div>
          <div class="col"><label class="form-label">Longitude</label>
            <input type="number" step="any" class="form-control" :value="place.lng ?? ''" @input="place.lng = num($event)" /></div>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button class="btn btn-outline-secondary btn-sm" @click="geo">Usar minha localização</button>
          <button class="btn btn-outline-secondary btn-sm" @click="exportPlace(place)">Exportar JSON</button>
        </div>
      </div></div>
    </div>
    <div class="col-lg-7">
      <div class="card"><div class="card-body">
        <h5 class="card-title">Andares</h5>
        <p v-if="!place.floors.length" class="text-muted">Nenhum andar ainda.</p>
        <div class="list-group mb-3">
          <div v-for="(f, i) in place.floors" :key="f.id" class="list-group-item d-flex flex-wrap gap-2 align-items-center">
            <input v-model="f.name" class="form-control form-control-sm w-auto flex-grow-1" />
            <span class="small text-muted">{{ f.map.blocks.length }} áreas</span>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" :disabled="i === 0" title="Subir" @click="moveFloor(place, i, -1)">↑</button>
              <button class="btn btn-outline-secondary" :disabled="i === place.floors.length - 1" title="Descer" @click="moveFloor(place, i, 1)">↓</button>
            </div>
            <button class="btn btn-sm btn-primary" @click="emit('go', { name: 'areas', placeId: place.id, floorId: f.id })">Editar mapa</button>
            <button class="btn btn-sm btn-outline-secondary" title="Editor de grade" @click="emit('go', { name: 'floor', placeId: place.id, floorId: f.id })">Grade</button>
            <button class="btn btn-sm btn-outline-danger" @click="excluir(i)">Excluir</button>
          </div>
        </div>
        <div class="row g-2 align-items-end">
          <div class="col-12 col-sm"><label class="form-label">Nome do andar</label>
            <input v-model="nf.name" class="form-control" placeholder="Ex.: Piso L1" /></div>
          <div class="col-auto"><button class="btn btn-success" @click="adicionar">Adicionar andar</button></div>
        </div>
      </div></div>
    </div>
  </div>
</template>
