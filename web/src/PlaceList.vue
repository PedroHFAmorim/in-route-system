<script setup lang="ts">
import { addPlace, deletePlace, exportPlace, importPlace, state, typeName, type Place, type View } from './store.ts'

const emit = defineEmits<{ go: [v: View] }>()

function novo() {
  emit('go', { name: 'place', id: addPlace().id })
}
function excluir(p: Place) {
  if (confirm(`Excluir "${p.name || 'Sem nome'}" e todos os andares?`)) deletePlace(p.id)
}
async function importar(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try { emit('go', { name: 'place', id: (await importPlace(f)).id }) }
  catch (err) { alert('Falha ao importar: ' + (err as Error).message) }
}
</script>

<template>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
    <h4 class="mb-0 me-auto">Lugares</h4>
    <label class="btn btn-outline-secondary mb-0">Importar JSON<input type="file" accept="application/json,.json" hidden @change="importar" /></label>
    <button class="btn btn-primary" @click="novo">Novo lugar</button>
  </div>
  <p v-if="!state.places.length" class="text-muted">Nenhum lugar cadastrado.</p>
  <div class="list-group">
    <div v-for="p in state.places" :key="p.id" class="list-group-item d-flex flex-wrap gap-2 align-items-center">
      <a href="#" class="me-auto text-decoration-none" @click.prevent="emit('go', { name: 'place', id: p.id })">
        <strong>{{ p.name || 'Sem nome' }}</strong>
        <div class="small text-muted">{{ typeName(p.typeId) || 'Sem tipo' }} · {{ p.floors.length }} andar(es)</div>
      </a>
      <button class="btn btn-sm btn-outline-secondary" @click="exportPlace(p)">Exportar JSON</button>
      <button class="btn btn-sm btn-outline-danger" @click="excluir(p)">Excluir</button>
    </div>
  </div>
</template>
