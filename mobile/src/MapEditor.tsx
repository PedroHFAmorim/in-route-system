import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Reading } from '../matcher.ts';
import { useHeading } from './heading.ts';
import { mapQualityLabel } from './logic.ts';
import { bleSnapshotFull, connectedSafe, scanBudgetedFull, startBleSession, startPassive, stopBleSession, stopPassive } from './scanner.ts';
import { enqueue } from './scanQueue.ts';
import { toApiWifi } from './scanQueue.logic.ts';
import { NetworkHint } from './NetworkHint.tsx';
import { SignalChart } from './SignalChart.tsx';
import { newId, type Block, type Place } from './store.ts';
import { Btn, C, FS, SHADOW, SP } from './ui.tsx';

const SAMPLE_MAX_AGE_MS = 10000; // amostra gravada com dado velho já custou um dia de testes em campo
const Z = 84; // square size in px
const key = (c: number, r: number) => `${c},${r}`;
const norm = (d: number) => ((d % 360) + 360) % 360;
const scanned = (b: Block) => b.samples.length > 0;

export function MapEditor({ place, update, back, done, saveError }: { place: Place; update: (p: Place) => void; back: () => void; done: () => void; saveError?: string }) {
  const map = place.map ?? { cols: 1, rows: 1, blocks: [] };
  const [selId, setSelId] = useState<string | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [waitUntil, setWaitUntil] = useState(0); // fim do throttling do Android (epoch ms); 0 = sem espera
  const [, setTick] = useState(0);
  const [chart, setChart] = useState<Reading[]>([]);
  const { heading, available: compass } = useHeading();
  const insets = useSafeAreaInsets();
  const azimuth0 = useRef<number | null>(map.azimuth0 ?? null);

  const setBlocks = (blocks: Block[]) => update({ ...place, map: { ...map, blocks, azimuth0: azimuth0.current ?? undefined } });

  // Receiver passivo: os scans do sistema mantêm o cache quente enquanto o usuário mapeia. Cleanup cobre qualquer queda da tela.
  useEffect(() => {
    startPassive().catch(() => {});
    startBleSession().catch(() => {}); // BLE contínuo: o snapshot ao gravar amostra não espera varredura
    return () => { stopPassive().catch(() => {}); stopBleSession().catch(() => {}); };
  }, []);

  // Rede conectada: leitura barata (não gasta orçamento de scan), ao montar e a cada 15 s para o aviso de dados móveis.
  const [netSsid, setNetSsid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => { connectedSafe().then((r) => { if (alive) setNetSsid(r ? r.ssid ?? '' : null); }); };
    read();
    const t = setInterval(read, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Re-renderiza a cada segundo só enquanto há contagem regressiva.
  useEffect(() => {
    if (!waitUntil) return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() >= waitUntil) setWaitUntil(0);
    }, 1000);
    return () => clearInterval(t);
  }, [waitUntil]);
  const waitLeft = waitUntil ? Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)) : 0;

  // Start with a single square in the middle.
  useEffect(() => {
    if (map.blocks.length === 0) {
      const b: Block = { id: newId(), name: 'Q1', color: C.primary, cells: [{ c: 0, r: 0 }], samples: [] };
      setBlocks([b]);
      setSelId(b.id);
    } else if (!selId) {
      setSelId(map.blocks[0].id);
    }
  }, []);

  // The heading at open is the reference azimuth (0°); the arrow shows facing relative to it.
  useEffect(() => {
    if (heading != null && azimuth0.current == null) {
      azimuth0.current = heading;
      update({ ...place, map: { ...map, azimuth0: heading } });
    }
  }, [heading]);
  const arrowDeg = heading != null && azimuth0.current != null ? norm(heading - azimuth0.current) : null;

  const sel = map.blocks.find((b) => b.id === selId) ?? null;
  const occupied = useMemo(() => new Set(map.blocks.map((b) => key(b.cells[0].c, b.cells[0].r))), [map.blocks]);
  const neighbors = sel
    ? [
        { c: sel.cells[0].c, r: sel.cells[0].r - 1 },
        { c: sel.cells[0].c, r: sel.cells[0].r + 1 },
        { c: sel.cells[0].c - 1, r: sel.cells[0].r },
        { c: sel.cells[0].c + 1, r: sel.cells[0].r },
      ].filter((n) => !occupied.has(key(n.c, n.r)))
    : [];

  const addAt = (c: number, r: number) => {
    const b: Block = { id: newId(), name: `Q${map.blocks.length + 1}`, color: C.primary, cells: [{ c, r }], samples: [] };
    setBlocks([...map.blocks, b]);
    setSelId(b.id);
  };

  const removeSel = () => {
    if (!sel || map.blocks.length <= 1) return;
    const rest = map.blocks.filter((b) => b.id !== sel.id);
    setBlocks(rest);
    setSelId(rest[0].id);
  };

  const scanSel = async () => {
    if (!sel || busy) return;
    setBusy(true);
    setStatus('Escaneando…');
    try {
      // forced: o usuário pediu agora; maxAgeMs curto: cache só serve se for bem recente.
      const wifiScan = await scanBudgetedFull({ maxAgeMs: SAMPLE_MAX_AGE_MS, forced: true });
      const bleScan = await bleSnapshotFull(SAMPLE_MAX_AGE_MS); // janela curta: precisão importa ao gravar, igual ao Wi-Fi
      const startedAt = wifiScan.startedAt;
      const fresh = wifiScan.ageMs != null && wifiScan.ageMs <= SAMPLE_MAX_AGE_MS;
      const readings = fresh ? wifiScan.kept : []; // nunca grava leitura velha
      const ble = bleScan.kept;
      // Coleta: manda as leituras CRUAS (sem filtro) com o rótulo do bloco; fila offline, não bloqueia.
      if ((fresh && wifiScan.raw.length) || bleScan.raw.length) {
        enqueue({
          kind: 'sample', placeId: place.id, placeName: place.name, blockId: sel.id, blockName: sel.name,
          heading, startedAt, wifi: fresh ? toApiWifi(wifiScan.raw) : [], ble: bleScan.raw,
        });
      }
      setChart([...readings, ...ble]);
      const limited = wifiScan.throttled || wifiScan.waitMs > 0;
      // Sem Wi-Fi novo e o Android está limitando: não grava, mostra quanto falta (contagem regressiva).
      if (!readings.length && limited) {
        setWaitUntil(Date.now() + wifiScan.waitMs);
        setStatus('');
        return;
      }
      if (!readings.length && !ble.length) { setStatus('Nenhuma rede detectada. Confira Localização/Wi-Fi ligados e tente de novo.'); return; }
      setWaitUntil(0);
      const sample = { name: sel.id, createdAt: new Date().toISOString(), readings, ...(ble.length ? { ble } : {}) };
      setBlocks(map.blocks.map((b) => (b.id === sel.id ? { ...b, samples: [...b.samples, sample] } : b)));
      setStatus('');
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    const cells = map.blocks.flatMap((b) => b.cells);
    if (cells.length) {
      const minC = Math.min(...cells.map((c) => c.c));
      const minR = Math.min(...cells.map((c) => c.r));
      const maxC = Math.max(...cells.map((c) => c.c));
      const maxR = Math.max(...cells.map((c) => c.r));
      update({
        ...place,
        map: {
          ...map, azimuth0: azimuth0.current ?? undefined, cols: maxC - minC + 1, rows: maxR - minR + 1,
          blocks: map.blocks.map((b) => ({ ...b, cells: b.cells.map((c) => ({ c: c.c - minC, r: c.r - minR })) })),
        },
      });
    }
    done();
  };

  const ctr = sel ? { c: sel.cells[0].c + 0.5, r: sel.cells[0].r + 0.5 } : { c: 0.5, r: 0.5 };
  const tx = vp.w / 2 - ctr.c * Z;
  const ty = vp.h / 2 - ctr.r * Z;
  const doneCount = map.blocks.filter(scanned).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#E9EDF2' }} onLayout={(e) => setVp({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Map plane */}
      {vp.w > 0 && (
        <View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: tx }, { translateY: ty }] }}>
          {map.blocks.map((b) => {
            const { c, r } = b.cells[0];
            const on = scanned(b);
            const tone = on ? C.success : C.danger;
            const isSel = b.id === selId;
            return (
              <Pressable
                key={b.id}
                onPress={() => setSelId(b.id)}
                style={{
                  position: 'absolute', left: c * Z + 4, top: r * Z + 4, width: Z - 8, height: Z - 8, borderRadius: 12,
                  backgroundColor: tone + (on ? '33' : '22'),
                  borderWidth: isSel ? 3 : 2, borderColor: isSel ? C.primary : tone,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22 }}>{on ? '✓' : '○'}</Text>
                <Text style={{ fontSize: 10, color: C.muted }}>{on ? `${b.samples.length} leitura${b.samples.length > 1 ? 's' : ''}` : 'vazio'}</Text>
              </Pressable>
            );
          })}
          {/* Add-square buttons on the selected square's free edges */}
          {neighbors.map((n) => (
            <Pressable
              key={key(n.c, n.r)}
              onPress={() => addAt(n.c, n.r)}
              style={{
                position: 'absolute', left: n.c * Z + Z / 2 - 20, top: n.r * Z + Z / 2 - 20, width: 40, height: 40, borderRadius: 20,
                backgroundColor: '#fff', borderWidth: 2, borderColor: C.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', ...SHADOW,
              }}
            >
              <Text style={{ fontSize: 24, color: C.primary, lineHeight: 26 }}>+</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Facing arrow, pinned to the selected square (viewport center) */}
      {arrowDeg != null && vp.w > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: vp.w / 2 - 22, top: vp.h / 2 - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ transform: [{ rotate: `${arrowDeg}deg` }] }}>
            <Text style={{ fontSize: 30, color: C.primary }}>➤</Text>
          </View>
        </View>
      )}

      {/* Floating header */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top + SP.sm, paddingHorizontal: SP.md, paddingBottom: SP.sm, flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
        <Pressable onPress={back} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...SHADOW }}>
          <Text style={{ fontSize: FS.xl, color: C.primary }}>←</Text>
        </Pressable>
        <View style={{ backgroundColor: '#fffffff2', borderRadius: 12, paddingHorizontal: SP.md, paddingVertical: SP.xs, ...SHADOW }}>
          <Text style={{ fontWeight: '700', color: C.text }}>Mapear {place.name}</Text>
          <Text style={{ fontSize: 11, color: C.muted }}>
            {mapQualityLabel(map.blocks)}{compass === false ? ' · sem bússola' : arrowDeg != null ? ` · ${Math.round(arrowDeg)}°` : ''}
          </Text>
          <Text style={{ fontSize: 11, color: doneCount ? C.success : C.danger }}>
            {doneCount ? 'Já dá para navegar; leituras extras no mesmo quadrado melhoram a precisão.' : 'Escaneie ao menos um quadrado para poder navegar.'}
          </Text>
        </View>
      </View>

      {/* Signal chart, bottom-left */}
      <SignalChart readings={chart} bottom={SP.md + insets.bottom} />

      {/* Actions, bottom-right */}
      <View style={{ position: 'absolute', right: SP.md, bottom: SP.md + insets.bottom, gap: SP.sm, alignItems: 'flex-end' }}>
        <NetworkHint floating conn={netSsid === null ? null : { ssid: netSsid }} />
        {saveError ? (
          <View style={{ backgroundColor: '#f8d7da', borderRadius: 10, paddingHorizontal: SP.md, paddingVertical: SP.xs, maxWidth: 260, ...SHADOW }}>
            <Text style={{ fontSize: FS.sm, color: '#842029' }}>{saveError}</Text>
          </View>
        ) : null}
        {waitLeft > 0 && !busy ? (
          <View style={{ backgroundColor: '#fffffff2', borderRadius: 10, paddingHorizontal: SP.md, paddingVertical: SP.xs, maxWidth: 240, ...SHADOW }}>
            <Text style={{ fontSize: FS.sm, color: C.danger }}>Android limitando scans: nova leitura em {waitLeft} s. Amostra não gravada.</Text>
          </View>
        ) : null}
        {status ? (
          <View style={{ backgroundColor: '#fffffff2', borderRadius: 10, paddingHorizontal: SP.md, paddingVertical: SP.xs, maxWidth: 240, ...SHADOW }}>
            <Text style={{ fontSize: FS.sm, color: status.startsWith('Escaneando') ? C.muted : C.danger }}>{status}</Text>
          </View>
        ) : null}
        {sel && map.blocks.length > 1 && (
          <Btn title="Remover quadrado" size="sm" variant="outline" style={{ ...SHADOW }} onPress={removeSel} />
        )}
        <Btn
          title={busy ? 'Escaneando…' : !sel || !scanned(sel) ? 'Escanear quadrado' : 'Escanear de novo'}
          size="lg"
          disabled={busy || !sel}
          style={{ ...SHADOW }}
          onPress={scanSel}
        />
        <Btn title="Concluir" size="md" variant="success" style={{ ...SHADOW }} onPress={finish} />
      </View>
    </View>
  );
}
