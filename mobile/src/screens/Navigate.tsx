import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeading } from '../heading.ts';
import { arrowDeg, blockCenter } from '../logic.ts';
import { fuse, rank, rankBle, type Fused, type Reading } from '../../matcher.ts';
import { NavMap } from '../MapGrid.tsx';
import { bleScanFull, connectedSafe, scanBudgetedFull, wifiReadyNow, type RawReading } from '../scanner.ts';
import { enqueue } from '../scanQueue.ts';
import { load, type Place } from '../store.ts';
import { Btn, C, FS, SP } from '../ui.tsx';

const REFRESH_MS = 30000;
const MOVE_DB = 8; // ponytail: connected-AP RSSI shift that counts as "maybe moved" → spend a full scan. Tune in field.
const SRC = { both: 'Confirmado por Wi-Fi e Bluetooth', wifi: 'Por Wi-Fi', ble: 'Por Bluetooth' };
const hhmmss = (d: Date) => d.toTimeString().slice(0, 8);

export default function Navigate({ placeId }: { placeId: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [match, setMatch] = useState<Fused | null>(null);
  const [lost, setLost] = useState(false);
  const [at, setAt] = useState('');
  const [status, setStatus] = useState('');
  const [nextIn, setNextIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [aps, setAps] = useState<{ wifi: Reading[]; ble: Reading[] }>({ wifi: [], ble: [] });
  const { heading } = useHeading();
  const headingNow = useRef<number | null>(null);
  headingNow.current = heading;
  const insets = useSafeAreaInsets();
  const alive = useRef(true);
  const kick = useRef<() => void>(() => {}); // "Atualizar agora" skips the 30 s countdown
  const forceFull = useRef(false); // "Atualizar agora" also forces a full Wi-Fi scan this cycle

  useEffect(() => {
    alive.current = true;
    (async () => {
      const p = (await load()).places.find((x) => x.id === placeId) ?? null;
      if (!alive.current || !p?.map) return;
      setPlace(p);
      const samples = p.map.blocks.flatMap((b) => b.samples);
      let first = true;
      const last = { bssid: null as string | null, rssi: 0 }; // last connected AP, to detect movement
      while (alive.current) {
        setBusy(true);
        try {
          // Unthrottled signals every tick: connected AP + BLE.
          let startedAt = new Date().toISOString();
          const conn = await connectedSafe();
          const bleFull = await bleScanFull();
          const ble = bleFull.kept;
          if (!alive.current) return;

          // Spend a (throttled) full scan only when it's worth it: first fix, no connected AP,
          // moved (connected AP changed or its RSSI shifted), or the user tapped "Atualizar agora".
          const moved = !!conn && last.bssid != null && (conn.bssid !== last.bssid || Math.abs(conn.rssi - last.rssi) > MOVE_DB);
          const wantFull = first || !conn || moved || forceFull.current;
          forceFull.current = false;

          let wifi: Reading[] | null = null;
          let confirmed = false;
          let wifiRaw: RawReading[] = [];
          if (wantFull && wifiReadyNow()) {
            const fullScan = await scanBudgetedFull().catch(() => null);
            const full = fullScan?.kept ?? [];
            if (fullScan) { wifiRaw = fullScan.raw; startedAt = fullScan.startedAt; }
            if (full.length) { wifi = full; confirmed = true; }
          }
          if (!wifi) wifi = conn ? [conn] : null; // fallback: connected AP as a 1-AP fingerprint
          if (!wifiRaw.length && conn) wifiRaw = [conn]; // scan completo vazio/não feito: ao menos o AP conectado
          if (conn) { last.bssid = conn.bssid; last.rssi = conn.rssi; }
          if (!alive.current) return;

          setAps({ wifi: wifi ?? [], ble });
          const m = fuse(wifi ? rank(wifi, samples)[0] ?? null : null, rankBle(ble, samples)[0] ?? null, confirmed);
          setMatch(m);
          // Coleta: todo ciclo com leitura vira um scan "locate" (inclusive sem match). Não bloqueia nem lança.
          if (wifiRaw.length || bleFull.raw.length) {
            enqueue({
              kind: 'locate', placeId: p.id, placeName: p.name, heading: headingNow.current, startedAt, wifi: wifiRaw, ble: bleFull.raw,
              match: m ? { name: p.map.blocks.find((b) => b.id === m.name)?.name ?? m.name, dist: m.dist, common: m.common, source: m.source, sure: m.sure } : null,
            });
          }
          setLost(!m);
          setAt(hhmmss(new Date()));
          setStatus(confirmed ? '' : conn ? 'Mantendo por Wi-Fi conectado + Bluetooth' : 'Sem rede conectada; por Bluetooth');
          first = false;
        } catch (e: any) {
          if (!alive.current) return;
          setStatus(e?.message ?? String(e));
        }
        setBusy(false);
        // Countdown to next refresh.
        const end = Date.now() + REFRESH_MS;
        let skip = false;
        kick.current = () => { skip = true; };
        while (alive.current && !skip && Date.now() < end) {
          setNextIn(Math.ceil((end - Date.now()) / 1000));
          await new Promise((r) => setTimeout(r, 1000));
        }
        setNextIn(0);
      }
    })();
    return () => { alive.current = false; };
  }, [placeId]);

  if (!place?.map) return <Text style={{ padding: SP.lg }}>Carregando...</Text>;
  const map = place.map;
  const block = match ? map.blocks.find((b) => b.id === match.name) : undefined;
  const sure = !!match?.sure;

  const title = block ? block.name : lost ? 'Local não identificado' : busy ? 'Escaneando…' : 'Procurando…';
  const dot = sure ? C.success : block ? C.warning : C.muted;

  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <NavMap
        cols={map.cols} rows={map.rows} blocks={map.blocks} bg={map.bg} highlightBlockId={block?.id} tintOthers
        center={block ? blockCenter(block.cells) : undefined}
        deg={block && block.headingRef != null && heading != null ? arrowDeg(heading, block.headingRef) : undefined}
      />

      {/* Floating bottom sheet */}
      <View
        style={{
          backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: SP.lg + insets.bottom, marginTop: -24, maxHeight: '54%',
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 16,
        }}
      >
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginVertical: SP.sm }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} />
          <Text style={{ color: C.muted, fontSize: FS.sm, fontWeight: '600' }}>
            {block ? (sure ? 'VOCÊ ESTÁ EM' : 'PROVAVELMENTE EM') : place.name.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 30, fontWeight: '800', color: sure ? C.success : C.text, marginTop: SP.xs }}>{title}</Text>

        <Text style={{ color: C.muted, fontSize: FS.sm, marginTop: SP.xs }}>
          {at ? `Atualizado ${at}` : 'Aguardando primeira leitura'}
          {nextIn > 0 ? ` · próxima em ${nextIn}s` : ''}
          {match && at ? ` · ${SRC[match.source]}` : ''}
        </Text>
        {status ? <Text style={{ color: C.primary, fontSize: FS.sm, marginTop: SP.xs }}>{status}</Text> : null}
        {block && block.headingRef == null ? (
          <Text style={{ color: C.muted, fontSize: FS.sm, marginTop: SP.xs }}>Direção não calibrada neste bloco.</Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md }}>
          <Btn title={busy ? 'Escaneando…' : 'Atualizar agora'} size="md" style={{ flex: 1 }} disabled={busy} onPress={() => { forceFull.current = true; kick.current(); }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SP.lg, marginBottom: SP.xs }}>
          <Text style={{ fontWeight: '700', color: C.text, fontSize: FS.sm }}>Pontos detectados</Text>
          <Text style={{ color: C.muted, fontSize: FS.sm }}>{aps.wifi.length} Wi-Fi · {aps.ble.length} BLE</Text>
        </View>
        <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
          {[...aps.wifi.map((r) => ({ ...r, kind: 'wifi' })), ...aps.ble.map((r) => ({ ...r, kind: 'ble' }))]
            .sort((a, b) => b.rssi - a.rssi)
            .map((r) => (
              <View key={r.kind + r.bssid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: SP.sm }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.kind === 'ble' ? C.primary : C.success }} />
                <Text style={{ flex: 1, color: C.text, fontSize: FS.sm }} numberOfLines={1}>{r.ssid || '(sem nome)'}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{signalBars(r.rssi)}</Text>
                <Text style={{ color: C.muted, fontSize: FS.sm, width: 64, textAlign: 'right' }}>{r.rssi} dBm</Text>
              </View>
            ))}
          {aps.wifi.length + aps.ble.length === 0 ? (
            <Text style={{ color: C.muted, fontSize: FS.sm, paddingVertical: SP.sm }}>Nenhum ponto na última leitura.</Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

// -30 dBm (full) .. -90 dBm (empty) → 4-bar strength glyph.
function signalBars(rssi: number): string {
  const n = Math.max(0, Math.min(4, Math.round((rssi + 90) / 15)));
  return '▂▄▆█'.slice(0, n).padEnd(4, '·');
}
