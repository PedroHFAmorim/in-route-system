<script setup lang="ts">
import { computed, ref } from 'vue'
import { getPlace, type View } from './store.ts'
import PlaceList from './PlaceList.vue'
import PlaceEdit from './PlaceEdit.vue'
import FloorEditor from './FloorEditor.vue'
import AreaEditor from './AreaEditor.vue'

const view = ref<View>({ name: 'places' })
const placeId = computed(() => (view.value.name === 'places' ? '' : view.value.name === 'place' ? view.value.id : view.value.placeId))
const ed = computed(() => view.value.name === 'floor' || view.value.name === 'areas')
const place = computed(() => getPlace(placeId.value))
</script>

<template>
  <div class="d-flex flex-column vh-100">
  <nav class="navbar navbar-dark navbar-ir px-3" style="flex: none">
    <span class="navbar-brand mb-0 d-flex align-items-center gap-2">
      <img src="/logo.svg" alt="" width="32" height="32" />
      <span class="brand-word">In-<b>Route</b></span>
      <span class="small opacity-50 fw-normal">Mapas</span>
    </span>
    <ol class="breadcrumb mb-0 small">
      <li class="breadcrumb-item"><a href="#" class="text-light" @click.prevent="view = { name: 'places' }">Lugares</a></li>
      <li v-if="place" class="breadcrumb-item text-white">
        <a v-if="view.name === 'floor' || view.name === 'areas'" href="#" class="text-light" @click.prevent="view = { name: 'place', id: place.id }">{{ place.name || 'Sem nome' }}</a>
        <template v-else>{{ place.name || 'Sem nome' }}</template>
      </li>
    </ol>
  </nav>
  <main class="container-fluid flex-grow-1" :class="ed ? 'main-ed p-2' : 'overflow-auto py-3'" style="min-height: 0">
    <PlaceList v-if="view.name === 'places'" @go="view = $event" />
    <PlaceEdit v-else-if="view.name === 'place' && place" :place="place" @go="view = $event" />
    <FloorEditor v-else-if="view.name === 'floor' && place" :key="view.floorId" :place="place" :floor-id="view.floorId" @go="view = $event" />
    <AreaEditor v-else-if="view.name === 'areas' && place" :key="view.floorId" :place="place" :floor-id="view.floorId" @go="view = $event" />
  </main>
  </div>
</template>
