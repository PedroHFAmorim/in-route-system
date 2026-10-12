import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { Nav } from '../../App.tsx';
import { formatDist, haversineM } from '../logic.ts';
import { deletePlace, hasNavigableMap, load, type Place, type PlaceType } from '../store.ts';
import { Badge, Btn, Card, C, FS, SP } from '../ui.tsx';

type Pos = { lat: number; lng: number } | null;

export default function Home({ nav }: { nav: Nav }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [types, setTypes] = useState<PlaceType[]>([]);
  const [pos, setPos] = useState<Pos>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const d = await load();
    setPlaces(d.places);
    setTypes(d.types);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      }
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const distOf = (p: Place) => (pos && p.lat != null && p.lng != null ? haversineM(pos.lat, pos.lng, p.lat, p.lng) : null);
  const sorted = places
    .map((p) => ({ p, d: distOf(p) }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity));

  const confirmDelete = (p: Place) =>
    Alert.alert('Excluir lugar?', p.name, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await deletePlace(p.id); refresh(); } },
    ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.light }}
      contentContainerStyle={{ padding: SP.lg }}
      data={sorted}
      keyExtractor={(x) => x.p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={<Btn title="+ Novo lugar" size="lg" style={{ marginBottom: SP.lg }} onPress={() => nav.push({ name: 'wizard' })} />}
      ListEmptyComponent={<Text style={{ color: C.muted, textAlign: 'center' }}>Nenhum lugar cadastrado. Toque em "+ Novo lugar" para começar.</Text>}
      renderItem={({ item: { p, d } }) => (
        <Card onLongPress={() => confirmDelete(p)}>
          <Text style={{ fontSize: FS.lg, fontWeight: '700', color: C.text }}>{p.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginVertical: SP.sm }}>
            <Badge text={types.find((t) => t.id === p.typeId)?.name ?? 'Sem tipo'} />
            <Text style={{ color: C.muted }}>{d != null ? formatDist(d) : 'Distância desconhecida'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            {hasNavigableMap(p) && (
              <Btn title="Navegar" size="sm" onPress={() => nav.push({ name: 'navigate', params: { placeId: p.id } })} />
            )}
            <Btn title="Mapa" size="sm" variant="outline" onPress={() => nav.push({ name: 'wizard', params: { placeId: p.id, step: 2 } })} />
          </View>
        </Card>
      )}
    />
  );
}
