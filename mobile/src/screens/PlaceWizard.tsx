import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import type { Nav } from '../../App.tsx';
import { useHeading } from '../heading.ts';
import { bbox, rectCells } from '../logic.ts';
import { ZoomMap } from '../MapGrid.tsx';
import { scanBudgeted } from '../scanner.ts';
import {
  ensureType, listTypes, load, newId, savePlace, type Block, type Cell, type Place, type PlaceMap, type PlaceType,
} from '../store.ts';
import { Badge, Btn, Card, C, FS, Input, PALETTE, SP } from '../ui.tsx';

type Props = { nav: Nav; placeId?: string; step?: 1 | 2 | 3 };

export default function PlaceWizard({ nav, placeId, step: initialStep }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep ?? 1);
  const [place, setPlace] = useState<Place | null>(null);
  const [ready, setReady] = useState(!placeId);

  useEffect(() => {
    if (!placeId) return;
    load().then((d) => {
      setPlace(d.places.find((p) => p.id === placeId) ?? null);
      setReady(true);
    });
  }, [placeId]);

  // Every change is persisted right away, so nothing is lost if the user leaves with the back button.
  const update = (p: Place) => {
    setPlace(p);
    savePlace(p).catch(() => {});
  };

  if (!ready) return null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.light }} contentContainerStyle={{ padding: SP.lg }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.muted, marginBottom: SP.md }}>Passo {step} de 3</Text>
      {step === 1 && <Step1 place={place} update={update} nav={nav} next={() => setStep(2)} />}
      {step === 2 && place && <Step2 place={place} update={update} back={() => setStep(1)} next={() => setStep(3)} />}
      {step === 3 && place?.map && <Step3 place={place} update={update} back={() => setStep(2)} done={() => nav.replaceAll({ name: 'home' })} />}
    </ScrollView>
  );
}

// ---------- Passo 1 ----------
function Step1({ place, update, nav, next }: { place: Place | null; update: (p: Place) => void; nav: Nav; next: () => void }) {
  const [name, setName] = useState(place?.name ?? '');
  const [types, setTypes] = useState<PlaceType[]>([]);
  const [sel, setSel] = useState<PlaceType | null>(null);
  const [typeText, setTypeText] = useState('');
  const [lat, setLat] = useState(place?.lat?.toString() ?? '');
  const [lng, setLng] = useState(place?.lng?.toString() ?? '');
  const [acc, setAcc] = useState<number | null>(null);
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

  const useLocation = async () => {
    setErr('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setErr('Permissão de localização negada.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(p.coords.latitude.toFixed(6));
      setLng(p.coords.longitude.toFixed(6));
      setAcc(p.coords.accuracy);
    } catch (e: any) {
      setErr('Não foi possível obter a localização: ' + (e?.message ?? e));
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
    if (!sel) return setErr('Selecione ou crie um tipo de lugar.'), null;
    const p: Place = {
      id: place?.id ?? newId(), name: name.trim(), typeId: sel.id, lat: num(lat), lng: num(lng),
      createdAt: place?.createdAt ?? new Date().toISOString(), map: place?.map,
    };
    update(p);
    return p;
  };

  return (
    <View>
      <Input label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Shopping Center de Teste" />

      <Text style={{ fontSize: FS.sm, fontWeight: '500', marginBottom: SP.xs }}>Tipo</Text>
      {sel ? (
        <View style={{ marginBottom: SP.md, flexDirection: 'row', gap: SP.sm, alignItems: 'center' }}>
          <Badge text={sel.name} color={C.primary} />
          <Pressable onPress={() => setSel(null)}><Text style={{ color: C.danger }}>trocar</Text></Pressable>
        </View>
      ) : (
        <>
          <Input value={typeText} onChangeText={setTypeText} placeholder="Digite para buscar ou criar" />
          <View style={{ marginTop: -SP.sm, marginBottom: SP.md, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 6 }}>
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
            {matches.length === 0 && q === '' && <Text style={{ padding: SP.md, color: C.muted }}>Nenhum tipo ainda. Digite para criar.</Text>}
          </View>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: SP.md }}>
        <View style={{ flex: 1 }}><Input label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Input label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" /></View>
      </View>
      <Btn title="Usar minha localização" variant="outline" onPress={useLocation} />
      {acc != null && <Text style={{ color: C.muted, marginTop: SP.xs }}>Precisão: ±{Math.round(acc)} m</Text>}

      {err ? <Text style={{ color: C.danger, marginTop: SP.md }}>{err}</Text> : null}
      <View style={{ gap: SP.sm, marginTop: SP.lg }}>
        <Btn title="Próximo: montar mapa" onPress={() => save() && next()} />
        <Btn title="Salvar sem mapa" variant="secondary" onPress={() => save() && nav.replaceAll({ name: 'home' })} />
      </View>
    </View>
  );
}

// ---------- Passo 2 ----------
type Tool = 'paint' | 'rect' | 'erase';

// Move `cells` to block `id` (or to nobody when id is null), removing them from every other block.
function assign(blocks: Block[], cells: Cell[], id: string | null): Block[] {
  const set = new Set(cells.map((x) => `${x.c},${x.r}`));
  return blocks.map((b) => {
    const kept = b.cells.filter((x) => !set.has(`${x.c},${x.r}`));
    return { ...b, cells: b.id === id ? [...kept, ...cells] : kept };
  });
}

function Step2({ place, update, back, next }: { place: Place; update: (p: Place) => void; back: () => void; next: () => void }) {
  const map: PlaceMap = place.map ?? { cols: 13, rows: 18, blocks: [] };
  const [selId, setSelId] = useState<string | null>(map.blocks[0]?.id ?? null);
  const [tool, setTool] = useState<Tool>('paint');
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [colsText, setColsText] = useState(String(map.cols));
  const [rowsText, setRowsText] = useState(String(map.rows));
  const [naming, setNaming] = useState<{ id: string | null; text: string } | null>(null);

  const setMap = (m: PlaceMap) => update({ ...place, map: m });

  const resize = (colsT: string, rowsT: string) => {
    setColsText(colsT);
    setRowsText(rowsT);
    const cols = parseInt(colsT, 10);
    const rows = parseInt(rowsT, 10);
    if (!(cols >= 2 && cols <= 60 && rows >= 2 && rows <= 60)) return;
    setMap({
      cols, rows,
      blocks: map.blocks.map((b) => ({ ...b, cells: b.cells.filter((x) => x.c < cols && x.r < rows) })),
    });
  };

  const submitName = () => {
    if (!naming || !naming.text.trim()) return setNaming(null);
    const text = naming.text.trim();
    if (naming.id) {
      setMap({ ...map, blocks: map.blocks.map((b) => (b.id === naming.id ? { ...b, name: text } : b)) });
    } else {
      const b: Block = { id: newId(), name: text, color: PALETTE[map.blocks.length % PALETTE.length], cells: [], samples: [] };
      setMap({ ...map, blocks: [...map.blocks, b] });
      setSelId(b.id);
    }
    setNaming(null);
  };

  const chipMenu = (b: Block) =>
    Alert.alert(b.name, undefined, [
      { text: 'Renomear', onPress: () => setNaming({ id: b.id, text: b.name }) },
      {
        text: 'Excluir', style: 'destructive',
        onPress: () => {
          const blocks = map.blocks.filter((x) => x.id !== b.id);
          if (selId === b.id) setSelId(blocks[0]?.id ?? null);
          setMap({ ...map, blocks });
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  const press = (c: number, r: number) => {
    const cell = { c, r };
    if (tool === 'erase') return setMap({ ...map, blocks: assign(map.blocks, [cell], null) });
    if (!selId) return Alert.alert('Crie um bloco', 'Toque em "+ Bloco" e escolha um nome antes de pintar.');
    if (tool === 'rect') {
      if (!anchor) return setAnchor(cell);
      setAnchor(null);
      return setMap({ ...map, blocks: assign(map.blocks, rectCells(anchor, cell), selId) });
    }
    const mine = map.blocks.find((b) => b.id === selId)?.cells.some((x) => x.c === c && x.r === r);
    setMap({ ...map, blocks: assign(map.blocks, [cell], mine ? null : selId) });
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: SP.md }}>
        <View style={{ flex: 1 }}><Input label="Colunas (2–60)" value={colsText} onChangeText={(t) => resize(t, rowsText)} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Input label="Linhas (2–60)" value={rowsText} onChangeText={(t) => resize(colsText, t)} keyboardType="number-pad" /></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: SP.sm }}>
        <View style={{ flexDirection: 'row', gap: SP.sm, alignItems: 'center' }}>
          {map.blocks.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setSelId(b.id)}
              onLongPress={() => chipMenu(b)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP.xs, paddingVertical: SP.xs + 2, paddingHorizontal: SP.md, borderRadius: 16,
                backgroundColor: '#fff', borderWidth: 2, borderColor: b.id === selId ? C.primary : C.border,
              }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: b.color }} />
              <Text style={{ color: C.text, fontWeight: b.id === selId ? '700' : '400' }}>{b.name}</Text>
            </Pressable>
          ))}
          <Btn title="+ Bloco" size="sm" variant="outline" onPress={() => setNaming({ id: null, text: '' })} />
        </View>
      </ScrollView>
      {map.blocks.length > 0 && <Text style={{ color: C.muted, fontSize: 12, marginBottom: SP.sm }}>Segure um bloco para renomear ou excluir.</Text>}

      {naming && (
        <View style={{ flexDirection: 'row', gap: SP.sm, marginBottom: SP.sm }}>
          <TextInput
            autoFocus value={naming.text} onChangeText={(t) => setNaming({ ...naming, text: t })} onSubmitEditing={submitName}
            placeholder="Nome do bloco" style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, backgroundColor: '#fff', paddingHorizontal: SP.md }}
          />
          <Btn title="OK" onPress={submitName} />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: SP.sm, marginBottom: SP.sm }}>
        {([['paint', 'Pintar'], ['rect', 'Retângulo'], ['erase', 'Apagar']] as const).map(([t, label]) => (
          <Btn key={t} title={label} size="sm" variant={tool === t ? 'primary' : 'outline'} onPress={() => { setTool(t); setAnchor(null); }} />
        ))}
      </View>
      {tool === 'rect' && <Text style={{ color: C.muted, marginBottom: SP.sm }}>{anchor ? 'Toque no canto oposto.' : 'Toque no primeiro canto do retângulo.'}</Text>}

      <ZoomMap cols={map.cols} rows={map.rows} blocks={map.blocks} marker={anchor ? { c: anchor.c + 0.5, r: anchor.r + 0.5 } : undefined} onCellPress={press} height={380} />

      <View style={{ flexDirection: 'row', gap: SP.sm, marginTop: SP.lg }}>
        <Btn title="Voltar" variant="secondary" style={{ flex: 1 }} onPress={back} />
        <Btn title="Próximo: calibrar" style={{ flex: 2 }} onPress={next} disabled={!map.blocks.some((b) => b.cells.length)} />
      </View>
    </View>
  );
}

// ---------- Passo 3 ----------
const CORNERS = ['superior esquerdo', 'superior direito', 'inferior direito', 'inferior esquerdo'];

function Step3({ place, update, back, done }: { place: Place; update: (p: Place) => void; back: () => void; done: () => void }) {
  const map = place.map!;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = map.blocks.find((b) => b.id === openId);

  const setBlock = (b: Block) => update({ ...place, map: { ...map, blocks: map.blocks.map((x) => (x.id === b.id ? b : x)) } });

  if (open) return <Calibrate map={map} block={open} setBlock={setBlock} close={() => setOpenId(null)} />;

  return (
    <View>
      {map.blocks.filter((b) => b.cells.length).map((b) => (
        <Card key={b.id} style={{ padding: SP.md }}>
          <Pressable onPress={() => setOpenId(b.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
            <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: b.color }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: FS.md, fontWeight: '600', color: C.text }}>{b.name}</Text>
              <Text style={{ color: C.muted }}>
                {Math.min(b.samples.length, 4)}/4 cantos{b.samples.length >= 4 ? ' ✓' : ''} · direção {b.headingRef != null ? '✓' : '—'}
              </Text>
            </View>
            <Text style={{ color: C.primary }}>Calibrar</Text>
          </Pressable>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: SP.sm, marginTop: SP.md }}>
        <Btn title="Voltar" variant="secondary" style={{ flex: 1 }} onPress={back} />
        <Btn title="Concluir" variant="success" style={{ flex: 2 }} onPress={done} />
      </View>
    </View>
  );
}

function Calibrate({ map, block, setBlock, close }: { map: PlaceMap; block: Block; setBlock: (b: Block) => void; close: () => void }) {
  const [samples, setSamples] = useState<Block['samples']>([]); // this session's corners; the first one replaces old samples
  const [busy, setBusy] = useState(false);
  const [waitMs, setWaitMs] = useState(0);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const heading = useHeading();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const idx = samples.length;
  const bb = bbox(block.cells);
  const corners = [
    { c: bb.c0, r: bb.r0 }, { c: bb.c1 + 1, r: bb.r0 }, { c: bb.c1 + 1, r: bb.r1 + 1 }, { c: bb.c0, r: bb.r1 + 1 },
  ];

  const doScan = async () => {
    setBusy(true);
    setErr('');
    try {
      const readings = await scanBudgeted((ms) => alive.current && setWaitMs(ms));
      const next = [...samples, { name: block.id, createdAt: new Date().toISOString(), readings }];
      setSamples(next);
      setBlock({ ...block, samples: next });
    } catch (e: any) {
      if (alive.current) setErr(e?.message ?? String(e));
    } finally {
      if (alive.current) { setBusy(false); setWaitMs(0); }
    }
  };

  const saveHeading = () => {
    if (heading == null) return;
    setBlock({ ...block, headingRef: Math.round(heading) });
    setSaved(true);
  };

  return (
    <View>
      <Text style={{ fontSize: FS.lg, fontWeight: '700', marginBottom: SP.sm }}>{block.name}</Text>
      <ZoomMap
        cols={map.cols} rows={map.rows} blocks={map.blocks} highlightBlockId={block.id} tintOthers height={260}
        marker={idx < 4 ? corners[idx] : undefined}
      />
      <View style={{ marginTop: SP.md }}>
        {idx < 4 ? (
          <>
            <Text style={{ fontSize: FS.md, marginBottom: SP.md }}>
              Vá até o canto {CORNERS[idx]} do bloco {block.name} e toque em Escanear
            </Text>
            <Btn title={busy ? 'Escaneando...' : `Escanear canto ${idx + 1}/4`} onPress={doScan} disabled={busy} size="lg" />
            {busy && waitMs > 0 && (
              <Text style={{ color: C.muted, marginTop: SP.sm }}>Aguardando liberação do Android: {Math.ceil(waitMs / 1000)} s</Text>
            )}
          </>
        ) : (
          <>
            <Text style={{ fontSize: FS.md, marginBottom: SP.sm }}>
              Aponte o celular para o TOPO do mapa (o lado de cima do desenho) e toque em Gravar direção
            </Text>
            <Text style={{ fontSize: FS.xl, fontWeight: '700', marginBottom: SP.md }}>{heading != null ? `${Math.round(heading)}°` : 'Sem bússola'}</Text>
            <Btn title={saved ? 'Direção gravada ✓ (regravar)' : 'Gravar direção'} variant={saved ? 'outline' : 'primary'} onPress={saveHeading} disabled={heading == null} size="lg" />
          </>
        )}
        {err ? <Text style={{ color: C.danger, marginTop: SP.sm }}>{err}</Text> : null}
        <Btn title={idx >= 4 && saved ? 'Voltar à lista' : 'Cancelar'} variant="secondary" style={{ marginTop: SP.md }} onPress={close} disabled={busy} />
      </View>
    </View>
  );
}
