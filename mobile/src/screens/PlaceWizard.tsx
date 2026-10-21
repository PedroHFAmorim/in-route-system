import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { Nav } from '../../App.tsx';
import { isUnauthorized } from '../api.ts';
import { reverseGeocode } from '../geocode.ts';
import { MapEditor } from '../MapEditor.tsx';
import { ensureType, listTypes, newId, savePlace, load, type Place, type PlaceType } from '../store.ts';
import { Badge, Btn, C, FS, Input, SP } from '../ui.tsx';

type Props = { nav: Nav; placeId?: string; step?: 1 | 2 | 3 };

export default function PlaceWizard({ nav, placeId, step: initialStep }: Props) {
  const [step, setStep] = useState<1 | 2>(initialStep && initialStep >= 2 ? 2 : 1);
  const [place, setPlace] = useState<Place | null>(null);
  const [ready, setReady] = useState(!placeId);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (!placeId) return;
    load().then((d) => {
      setPlace(d.places.find((p) => p.id === placeId) ?? null);
      setReady(true);
    });
  }, [placeId]);

  // Every change is persisted right away, so nothing is lost if the user leaves with the back button.
  // Falha de gravação precisa aparecer: engolida, o mapa some depois sem o usuário saber por quê.
  const update = (p: Place) => {
    setPlace(p);
    savePlace(p).then(
      () => setSaveErr(''),
      (e) => setSaveErr(isUnauthorized(e) ? 'Sessão expirada: entre de novo, o mapa não foi salvo.' : `Não foi possível salvar: ${e?.message ?? e}`),
    );
  };

  if (!ready) return null;

  // Step 2: full-screen map editor.
  if (step === 2 && place) {
    return <MapEditor place={place} update={update} back={() => setStep(1)} done={() => nav.replaceAll({ name: 'home' })} saveError={saveErr} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.light, padding: SP.lg }}>
      <Text style={{ color: C.muted, marginBottom: SP.md }}>Passo {step} de 2</Text>
      {saveErr ? <Text style={{ color: C.danger, marginBottom: SP.md }}>{saveErr}</Text> : null}
      <Step1 place={place} update={update} nav={nav} next={() => setStep(2)} />
    </View>
  );
}

// ---------- Passo 1: dados do lugar ----------
function Step1({ place, update, nav, next }: { place: Place | null; update: (p: Place) => void; nav: Nav; next: () => void }) {
  const [name, setName] = useState(place?.name ?? '');
  const [types, setTypes] = useState<PlaceType[]>([]);
  const [sel, setSel] = useState<PlaceType | null>(null);
  const [typeText, setTypeText] = useState('');
  const [lat, setLat] = useState(place?.lat?.toString() ?? '');
  const [lng, setLng] = useState(place?.lng?.toString() ?? '');
  const [address, setAddress] = useState(place?.address ?? '');
  const [acc, setAcc] = useState<number | null>(null);
  const [geo, setGeo] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    listTypes().then((t) => {
      setTypes(t);
      if (place) setSel(t.find((x) => x.id === place.typeId) ?? null);
    });
  }, []);

  const q = typeText.trim().toLowerCase();
  const matches = q ? types.filter((t) => t.name.toLowerCase().includes(q)) : types;
  const exact = types.some((t) => t.name.toLowerCase() === q);

  // GPS + reverse geocode (address is best-effort).
  const useLocation = async () => {
    setErr(''); setGeo('Obtendo localização…');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setGeo(''); return setErr('Permissão de localização negada.'); }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(p.coords.latitude.toFixed(6));
      setLng(p.coords.longitude.toFixed(6));
      setAcc(p.coords.accuracy);
      setGeo('Buscando endereço…');
      try { setAddress(await reverseGeocode(p.coords.latitude, p.coords.longitude)); } catch {}
      setGeo('');
    } catch (e: any) {
      setGeo(''); setErr('Não foi possível obter a localização: ' + (e?.message ?? e));
    }
  };

  const createType = async () => {
    const t = await ensureType(typeText);
    setTypes(await listTypes());
    setSel(t);
    setTypeText('');
  };

  const save = (): Place | null => {
    const num = (s: string) => (s.trim() === '' || isNaN(Number(s.replace(',', '.'))) ? null : Number(s.replace(',', '.')));
    if (!name.trim()) return setErr('Informe o nome do lugar.'), null;
    const p: Place = {
      id: place?.id ?? newId(), name: name.trim(), typeId: sel?.id ?? '', lat: num(lat), lng: num(lng),
      address: address.trim() || undefined, createdAt: place?.createdAt ?? new Date().toISOString(), map: place?.map,
    };
    update(p);
    return p;
  };

  return (
    <View>
      <Input label="Nome do lugar" value={name} onChangeText={setName} placeholder="Ex.: Shopping Center de Teste" />

      <Btn title={geo || 'Usar minha localização'} variant="outline" onPress={useLocation} disabled={!!geo} />
      <View style={{ flexDirection: 'row', gap: SP.md, marginTop: SP.md }}>
        <View style={{ flex: 1 }}><Input label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Input label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" /></View>
      </View>
      {acc != null && <Text style={{ color: C.muted, marginTop: -SP.sm, marginBottom: SP.sm }}>Precisão do GPS: ±{Math.round(acc)} m</Text>}
      <Input label="Endereço" value={address} onChangeText={setAddress} placeholder="Preenchido pela localização" multiline />

      <Text style={{ fontSize: FS.sm, fontWeight: '500', marginBottom: SP.xs }}>Tipo (opcional)</Text>
      {sel ? (
        <View style={{ marginBottom: SP.md, flexDirection: 'row', gap: SP.sm, alignItems: 'center' }}>
          <Badge text={sel.name} color={C.primary} />
          <Pressable onPress={() => setSel(null)}><Text style={{ color: C.danger }}>trocar</Text></Pressable>
        </View>
      ) : (
        <>
          <Input value={typeText} onChangeText={setTypeText} placeholder="Digite para buscar ou criar" />
          {(matches.length > 0 || q !== '') && (
            <View style={{ marginTop: -SP.sm, marginBottom: SP.md, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8 }}>
              {matches.map((t) => (
                <Pressable key={t.id} onPress={() => { setSel(t); setTypeText(''); }} style={{ padding: SP.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ color: C.text }}>{t.name}</Text>
                </Pressable>
              ))}
              {q !== '' && !exact && (
                <Pressable onPress={createType} style={{ padding: SP.md }}>
                  <Text style={{ color: C.primary }}>+ Criar tipo "{typeText.trim()}"</Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      )}

      {err ? <Text style={{ color: C.danger, marginTop: SP.md }}>{err}</Text> : null}
      <View style={{ gap: SP.sm, marginTop: SP.lg }}>
        <Btn title="Próximo: mapear o lugar" onPress={() => save() && next()} />
        <Btn title="Salvar sem mapa" variant="secondary" onPress={() => save() && nav.replaceAll({ name: 'home' })} />
      </View>
    </View>
  );
}
