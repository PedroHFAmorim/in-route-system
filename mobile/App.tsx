import { useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scan } from './modules/wifi-scan';
import { keep, rank, THRESHOLD_DB, type Match, type Sample } from './matcher';

const KEY = 'places';
const hhmmss = (d: Date) => d.toTimeString().slice(0, 8);

export default function App() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [places, setPlaces] = useState<Sample[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [info, setInfo] = useState<{ at: string; aps: number; throttled: boolean } | null>(null);
  const [ranking, setRanking] = useState<Match[]>([]);

  const [busy, setBusy] = useState(false);
  const placesRef = useRef<Sample[]>([]);

  // Um scan por toque: o Android (sem desativar a limitação) só permite 4 scans a cada 2 min.
  const doScan = async () => {
    const res = await scan();
    const fresh = res.readings.filter(keep);
    setInfo({ at: hhmmss(new Date()), aps: fresh.length, throttled: res.throttled || res.readings.length === 0 });
    return fresh;
  };

  useEffect(() => {
    (async () => {
      const perms = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      if (Platform.OS === 'android' && Platform.Version >= 33) perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
      const res = await PermissionsAndroid.requestMultiple(perms);
      setGranted(perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED));
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const saved: Sample[] = raw ? JSON.parse(raw) : [];
        placesRef.current = saved;
        setPlaces(saved);
      } catch {}
    })();
  }, []);

  const locate = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Localizando...');
    try {
      const r = rank(await doScan(), placesRef.current);
      setRanking(r);
      setStatus(r.length ? '' : 'Lugar não mapeado.');
    } catch (e: any) {
      setStatus('Erro no scan: ' + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const persist = async (next: Sample[]) => {
    placesRef.current = next;
    setPlaces(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setStatus('Escaneando...');
    try {
      // 1 scan por "Salvar" (limite do Android); salvar de novo com o mesmo nome = mais uma amostra.
      const readings = (await doScan()).map(({ bssid, ssid, rssi }) => ({ bssid, ssid, rssi }));
      if (readings.length) {
        await persist([...placesRef.current, { name: n, createdAt: new Date().toISOString(), readings }]);
        setName('');
        setStatus(`"${n}" salvo (${readings.length} APs).`);
      } else {
        setStatus('Nenhum AP novo no scan. Nada salvo.');
      }
    } catch (e: any) {
      setStatus('Erro ao salvar: ' + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (n: string) =>
    Alert.alert('Excluir lugar?', n, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => persist(placesRef.current.filter((s) => s.name !== n)) },
    ]);

  const counts = new Map<string, number>();
  for (const s of places) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const dist = new Map(ranking.map((m) => [m.name, m.dist]));
  const best = ranking[0];

  if (granted === false) {
    return <View style={s.root}><Text style={s.warn}>Permissão de localização / Wi-Fi negada. Conceda nas configurações do app.</Text></View>;
  }

  return (
    <View style={s.root}>
      <View style={s.row}>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Nome do lugar" />
        <Pressable style={[s.btn, busy && s.off]} onPress={save} disabled={busy}><Text style={s.btnText}>Salvar</Text></Pressable>
      </View>
      <Pressable style={[s.btn, s.big, busy && s.off]} onPress={locate} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Escaneando...' : 'Localizar'}</Text>
      </Pressable>
      {!!status && <Text style={s.small}>{status}</Text>}
      <Text style={s.small}>
        {info ? `Último scan ${info.at} · ${info.aps} APs` : 'Toque em Localizar'}
      </Text>
      {info && (info.throttled || info.aps === 0) && (
        <View style={s.banner}>
          <Text>Android limitou o scan (máx. 4 a cada 2 min). Aguarde ~30 s e tente de novo, ou desative 'Limitação de busca por Wi-Fi' em Opções do desenvolvedor {'>'} Rede.</Text>
          {info.aps === 0 && <Text>Localização do sistema ligada?</Text>}
        </View>
      )}
      <FlatList
        data={names}
        keyExtractor={(n) => n}
        ListEmptyComponent={<Text style={s.small}>Nenhum lugar salvo.</Text>}
        renderItem={({ item }) => {
          const isBest = best?.name === item;
          const bg = isBest ? (best.dist < THRESHOLD_DB ? '#b7f0b7' : '#fff3a0') : '#fff';
          const d = dist.get(item);
          return (
            <Pressable style={[s.item, { backgroundColor: bg }]} onLongPress={() => remove(item)}>
              <Text style={s.itemName}>{item}{isBest && best.dist >= THRESHOLD_DB ? ' (talvez)' : ''}</Text>
              <Text style={s.small}>
                {counts.get(item)} amostras{d !== undefined ? ` · ${d.toFixed(1)} dB` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 6, paddingHorizontal: 10, fontSize: 18 },
  btn: { backgroundColor: '#1565c0', borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 18 },
  big: { paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  off: { opacity: 0.5 },
  small: { fontSize: 15, color: '#444', marginVertical: 4 },
  banner: { backgroundColor: '#ffe27a', padding: 10, borderRadius: 6, marginVertical: 6 },
  warn: { fontSize: 18, color: '#b00020' },
  item: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  itemName: { fontSize: 20, fontWeight: '600' },
});
