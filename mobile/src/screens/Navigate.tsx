import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useHeading } from '../heading.ts';
import { arrowDeg, blockCenter } from '../logic.ts';
import { rank, THRESHOLD_DB, type Match } from '../../matcher.ts';
import { ZoomMap } from '../MapGrid.tsx';
import { scanBudgeted } from '../scanner.ts';
import { load, type Place } from '../store.ts';
import { Btn, Card, C, FS, SP } from '../ui.tsx';

const REFRESH_MS = 30000;
const hhmmss = (d: Date) => d.toTimeString().slice(0, 8);

export default function Navigate({ placeId }: { placeId: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [lost, setLost] = useState(false);
  const [at, setAt] = useState('');
  const [status, setStatus] = useState('');
  const [nextIn, setNextIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const heading = useHeading();
  const alive = useRef(true);
  const kick = useRef<() => void>(() => {}); // "Atualizar agora" skips the 30 s countdown

  useEffect(() => {
    alive.current = true;
    (async () => {
      const p = (await load()).places.find((x) => x.id === placeId) ?? null;
      if (!alive.current || !p?.map) return;
      setPlace(p);
      const samples = p.map.blocks.flatMap((b) => b.samples);
      while (alive.current) {
        setBusy(true);
        try {
          const readings = await scanBudgeted((ms) => alive.current && setStatus(`Aguardando liberação do Android: ${Math.ceil(ms / 1000)} s`));
          if (!alive.current) return;
          const r = rank(readings, samples);
          setMatch(r[0] ?? null);
          setLost(!r[0]);
          setAt(hhmmss(new Date()));
          setStatus('');
        } catch (e: any) {
          if (!alive.current) return;
          setStatus(e?.message ?? String(e));
        }
        setBusy(false);
        // Countdown to next refresh; the budget (4 per 120 s) fits exactly with 30 s.
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
  const sure = !!match && match.dist < THRESHOLD_DB;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.light }} contentContainerStyle={{ padding: SP.lg }}>
      <Card>
        <Text style={{ color: C.muted }}>{block ? (sure ? 'Você está em' : 'Provavelmente em') : place.name}</Text>
        <Text style={{ fontSize: FS.xl, fontWeight: '700', color: sure ? C.success : C.text }}>
          {block ? block.name : lost ? 'Não foi possível identificar o bloco' : busy ? 'Escaneando...' : '—'}
        </Text>
        <Text style={{ color: C.muted, marginTop: SP.sm }}>
          {at ? `Última atualização: ${at}` : 'Aguardando primeira leitura'}
          {nextIn > 0 ? ` · Próxima atualização em ${nextIn} s` : ''}
        </Text>
        {status ? <Text style={{ color: C.muted, marginTop: SP.xs }}>{status}</Text> : null}
        {block && block.headingRef == null && <Text style={{ color: C.muted, marginTop: SP.xs }}>Direção não calibrada neste bloco.</Text>}
        <Btn title="Atualizar agora" size="sm" variant="outline" style={{ marginTop: SP.md }} disabled={busy} onPress={() => kick.current()} />
      </Card>
      <ZoomMap
        cols={map.cols} rows={map.rows} blocks={map.blocks} highlightBlockId={block?.id} tintOthers height={420}
        arrow={block && block.headingRef != null && heading != null ? { ...blockCenter(block.cells), deg: arrowDeg(heading, block.headingRef) } : undefined}
      />
    </ScrollView>
  );
}
