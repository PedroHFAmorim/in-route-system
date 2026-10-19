import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Location from 'expo-location';
import type { Nav } from '../../App.tsx';
import { formatDist, haversineM } from '../logic.ts';
import { apiEnabled } from '../api.ts';
import { getUser, logout } from '../auth.ts';
import { flush, onPending, pendingCount } from '../scanQueue.ts';
import { deletePlace, hasNavigableMap, importPlaces, load, type Place, type PlaceType } from '../store.ts';
import { Badge, Btn, Card, C, FS, SP } from '../ui.tsx';

type Pos = { lat: number; lng: number } | null;

export default function Home({ nav }: { nav: Nav }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [types, setTypes] = useState<PlaceType[]>([]);
  const [pos, setPos] = useState<Pos>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [queued, setQueued] = useState(pendingCount());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const off = onPending(setQueued);
    flush(); // ao abrir: tenta mandar o que ficou pendente
    return off;
  }, []);

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

  const importJson = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      let json: unknown;
      try { json = JSON.parse(await new File(r.assets[0].uri).text()); } catch { throw new Error('JSON inválido: arquivo ilegível'); }
      const created = await importPlaces(json);
      await refresh();
      if (created.length === 1) nav.push({ name: 'wizard', params: { placeId: created[0].id, step: 3 } });
      else Alert.alert('Importado', `${created.map((p) => p.name).join(', ')}. Abra o "Mapa" de cada um para escanear os cantos das áreas.`);
    } catch (e) {
      Alert.alert('Erro ao importar', e instanceof Error ? e.message : String(e));
    }
  };

  // A fila de scans não é apagada ao sair: segue pendente e é enviada no próximo login.
  const confirmLogout = () =>
    Alert.alert('Sair da conta?', queued ? `${queued} leitura(s) na fila serão enviadas no próximo login.` : undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => { logout(); } },
    ]);

  const confirmDelete = (p: Place) =>
    Alert.alert('Excluir lugar?', p.name, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await deletePlace(p.id); refresh(); } },
    ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.light }}
      contentContainerStyle={{ padding: SP.lg, paddingBottom: SP.lg + insets.bottom }}
      data={sorted}
      keyExtractor={(x) => x.p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ marginBottom: SP.lg }}>
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            <Btn title="+ Novo lugar" size="lg" style={{ flex: 1 }} onPress={() => nav.push({ name: 'wizard' })} />
            <Btn title="Importar JSON" size="lg" variant="outline" style={{ flex: 1 }} onPress={importJson} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SP.sm }}>
            <Text style={{ color: C.muted, fontSize: 12, flexShrink: 1 }}>
              {apiEnabled() ? `API: ligada · ${queued} leitura${queued === 1 ? '' : 's'} na fila` : 'API: desligada (dados só no aparelho)'}
              {apiEnabled() && getUser() ? ` · ${getUser()!.email}` : ''}
            </Text>
            {apiEnabled() && getUser() ? (
              <Pressable onPress={confirmLogout} hitSlop={12}>
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '600', marginLeft: SP.sm }}>Sair</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
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
