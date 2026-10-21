import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeading } from '../heading.ts';
import { arrowDeg, blockCenter } from '../logic.ts';
import { fuse, keep, rank, rankBle, type Fused, type Reading } from '../../matcher.ts';
import { NavMap } from '../MapGrid.tsx';
import { addConnListener, addScanResultsListener, bleSnapshotFull, connectedSafe, scanBudgetedFull, startBleSession, startConnWatch, startPassive, stopBleSession, stopConnWatch, stopPassive } from '../scanner.ts';
import { enqueue } from '../scanQueue.ts';
import { toApiWifi, type ApiWifi } from '../scanQueue.logic.ts';
import { load, type Place } from '../store.ts';
import { NetworkHint } from '../NetworkHint.tsx';
import { Btn, C, FS, SP } from '../ui.tsx';

const REFRESH_MS = 30000;
const PASSIVE_DEBOUNCE_MS = 2000;
const MOVE_DEBOUNCE_MS = 3000; // um evento de RSSI chega a cada ~3 s: agenda uma vez e não deixa o timer ser reiniciado
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
  const running = useRef(false); // um ciclo por vez: evento passivo durante ciclo é ignorado
  const conn = useRef<Reading | null>(null); // último AP conectado vindo do evento (sem polling)
  const last = useRef({ bssid: null as string | null, rssi: 0 }); // último AP conectado, para detectar movimento
  const [read, setRead] = useState<{ origin: 'scan' | 'cache' | 'conn' | 'none'; ageMs: number | null; readAt: number; waitUntil: number } | null>(null);

  // Um ciclo de localização. `passive` = disparado por scan do aparelho: só lê o cache (grátis), sem BLE novo.
  // Retorna false se já havia ciclo em andamento (reentrância), para o chamador ignorar.
  const cycle = async (p: Place, passive: boolean): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      const samples = p.map?.blocks.flatMap((b) => b.samples) ?? [];
      let startedAt = new Date().toISOString();
      const c = conn.current;
      // Snapshot da sessão BLE contínua: instantâneo, então vale em todo ciclo (passivo ou não).
      const bleFull = await bleSnapshotFull();
      if (!alive.current) return true;
      const ble = bleFull.kept;

      // Quem decide se gasta scan ativo é o planScan dentro do scanner; aqui só dizemos o contexto.
      const moved = hasMoved(c, last.current);
      const forced = forceFull.current;
      forceFull.current = false;
      const fullScan = await scanBudgetedFull(passive ? { allowActive: false } : { moved, forced }).catch(() => null);
      if (!alive.current) return true;
      if (fullScan) startedAt = fullScan.startedAt;

      // Matcher usa Reading (filtrado); a API recebe o cru, ou ao menos o AP conectado.
      const confirmed = !!fullScan?.kept.length;
      const wifi: Reading[] | null = confirmed ? fullScan!.kept : c ? [c] : null;
      const wifiPayload: ApiWifi[] = fullScan?.raw.length ? toApiWifi(fullScan.raw) : c ? [c] : [];
      if (c) last.current = { bssid: c.bssid, rssi: c.rssi };

      setAps({ wifi: wifi ?? [], ble });
      const m = fuse(wifi ? rank(wifi, samples)[0] ?? null : null, rankBle(ble, samples)[0] ?? null, confirmed);
      setMatch(m);
      // Coleta: todo ciclo com leitura vira um scan "locate" (inclusive sem match). Não bloqueia nem lança.
      if (wifiPayload.length || bleFull.raw.length) {
        enqueue({
          kind: 'locate', placeId: p.id, placeName: p.name, heading: headingNow.current, startedAt, wifi: wifiPayload, ble: bleFull.raw,
          match: m ? { name: p.map?.blocks.find((b) => b.id === m.name)?.name ?? m.name, dist: m.dist, common: m.common, source: m.source, sure: m.sure } : null,
        });
      }
      setLost(!m);
      setAt(hhmmss(new Date()));
      setRead({
        origin: confirmed ? (fullScan!.source === 'active' ? 'scan' : 'cache') : c ? 'conn' : 'none',
        ageMs: confirmed ? fullScan!.ageMs : null,
        readAt: Date.now(),
        // Throttling: avisa quanto falta para uma leitura nova em vez de parecer travado.
        waitUntil: fullScan && (fullScan.throttled || fullScan.waitMs > 0) ? Date.now() + fullScan.waitMs : 0,
      });
      setStatus('');
    } catch (e: unknown) {
      if (alive.current) setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
    return true;
  };

  const [netSsid, setNetSsid] = useState<string | null>(null); // null = sem Wi-Fi conectado
  useEffect(() => {
    alive.current = true;
    let sub: { remove(): void } | null = null;
    let connSub: { remove(): void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    let connSeen = false;
    conn.current = null;
    // Fontes antes do load: o cleanup abaixo cobre qualquer queda da tela, mesmo durante o await.
    startPassive().catch(() => {});
    startBleSession().catch(() => {});
    startConnWatch().catch(() => {});
    // Leitura inicial para não começar sem nada; descartada se um evento já chegou antes dela.
    connectedSafe().then((r) => { if (alive.current && !connSeen) { conn.current = r; setNetSsid(r ? r.ssid ?? '' : null); } });
    (async () => {
      const p = (await load()).places.find((x) => x.id === placeId) ?? null;
      if (!alive.current || !p?.map) return;
      setPlace(p);
      // Scan do aparelho (grátis): relocaliza na hora. Debounce de 2 s evita rajada; cycle() ignora reentrância.
      sub = addScanResultsListener(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { if (alive.current) void cycle(p, true); }, PASSIVE_DEBOUNCE_MS);
      });
      // RSSI conectado por evento (~3 s): guarda o último e, se mudou de AP ou variou > MOVE_DB, dispara
      // ciclo já (sem esperar os 30 s). Agenda só se não há timer pendente — com evento a cada 3 s, um
      // debounce que reinicia nunca dispararia. Quem decide se há orçamento de scan é o planScan.
      connSub = addConnListener((e) => {
        connSeen = true;
        conn.current = e && keep(e) ? { bssid: e.bssid, ssid: e.ssid, rssi: e.rssi } : null;
        setNetSsid(conn.current ? conn.current.ssid ?? '' : null); // alimenta o aviso de rede; sem polling novo
        if (moveTimer || !hasMoved(conn.current, last.current)) return;
        moveTimer = setTimeout(() => {
          moveTimer = null;
          if (alive.current) void cycle(p, false); // false de reentrância: o próximo evento reavalia
        }, MOVE_DEBOUNCE_MS);
      });
      while (alive.current) {
        await cycle(p, false);
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
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      if (moveTimer) clearTimeout(moveTimer);
      sub?.remove();
      connSub?.remove();
      stopPassive().catch(() => {});
      stopBleSession().catch(() => {});
      stopConnWatch().catch(() => {});
    };
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
        <NetworkHint conn={netSsid === null ? null : { ssid: netSsid }} />
        {read ? (
          <Text style={{ color: C.muted, fontSize: FS.sm, marginTop: SP.xs }}>
            {describeRead(read)}
          </Text>
        ) : null}
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

// Mudou de AP ou o RSSI variou mais que MOVE_DB desde a última localização.
function hasMoved(c: Reading | null, l: { bssid: string | null; rssi: number }): boolean {
  return !!c && l.bssid != null && (c.bssid !== l.bssid || Math.abs(c.rssi - l.rssi) > MOVE_DB);
}

// Idade real da leitura + origem; se o Android está limitando, quanto falta para uma nova.
function describeRead(r: { origin: 'scan' | 'cache' | 'conn' | 'none'; ageMs: number | null; readAt: number; waitUntil: number }): string {
  const age = r.ageMs == null ? '' : ` (${Math.round((r.ageMs + Date.now() - r.readAt) / 1000)} s atrás)`;
  const base = r.origin === 'scan' ? `Leitura do próprio scan${age}` : r.origin === 'cache' ? `Leitura do cache do sistema${age}` : r.origin === 'conn' ? 'Só Wi-Fi conectado + Bluetooth' : 'Só Bluetooth';
  const left = Math.ceil((r.waitUntil - Date.now()) / 1000);
  return r.waitUntil && left > 0 ? `${base} · nova leitura completa em ${left} s` : base;
}

// -30 dBm (full) .. -90 dBm (empty) → 4-bar strength glyph.
function signalBars(rssi: number): string {
  const n = Math.max(0, Math.min(4, Math.round((rssi + 90) / 15)));
  return '▂▄▆█'.slice(0, n).padEnd(4, '·');
}
