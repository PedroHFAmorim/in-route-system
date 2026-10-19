import { useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { bbox } from './logic.ts';
import type { Block } from './store.ts';
import { Btn, C, SHADOW, SP } from './ui.tsx';

type Props = {
  cols: number; rows: number; cellSize: number; blocks: Block[];
  bg?: { uri: string; opacity: number };
  highlightBlockId?: string;
  marker?: { c: number; r: number }; // in cell units (may be fractional); drawn as a dot
  arrow?: { c: number; r: number; deg: number };
  onCellPress?: (c: number, r: number) => void;
  tintOthers?: boolean; // navigation: light tint for non-highlighted blocks
  noGrid?: boolean; // navigation: hide grid lines for a clean map
};

const tint = (hex: string) => hex + '55';

export function MapGrid({ cols, rows, cellSize: z, blocks, bg, highlightBlockId, marker, arrow, onCellPress, tintOthers, noGrid }: Props) {
  const w = cols * z, h = rows * z;
  // empty cells aren't rendered; block cells are merged into horizontal runs (one View each)
  const runs: { key: string; b: Block; c: number; r: number; n: number }[] = [];
  for (const b of blocks) {
    const byRow = new Map<number, number[]>();
    for (const x of b.cells) (byRow.get(x.r) ?? byRow.set(x.r, []).get(x.r)!).push(x.c);
    for (const [r, cs] of byRow) {
      cs.sort((p, q) => p - q);
      let st = cs[0], prev = st;
      for (let i = 1; i <= cs.length; i++) {
        if (i < cs.length && cs[i] <= prev + 1) { prev = cs[i]; continue; }
        runs.push({ key: `${b.id}:${r}:${st}`, b, c: st, r, n: prev - st + 1 });
        st = prev = cs[i];
      }
    }
  }
  const alpha = (hex: string) => (bg ? hex + '99' : hex);
  const lines = [];
  if (!bg && z >= 12 && !noGrid) {
    for (let c = 0; c <= cols; c++) lines.push(<View key={'v' + c} pointerEvents="none" style={{ position: 'absolute', left: c * z, top: 0, width: 0.5, height: h, backgroundColor: C.border }} />);
    for (let r = 0; r <= rows; r++) lines.push(<View key={'h' + r} pointerEvents="none" style={{ position: 'absolute', top: r * z, left: 0, height: 0.5, width: w, backgroundColor: C.border }} />);
  }

  return (
    <View style={{ width: w, height: h, backgroundColor: noGrid ? 'transparent' : '#fff' }}>
      {bg && <Image source={{ uri: bg.uri }} resizeMode="stretch" style={{ position: 'absolute', width: w, height: h, opacity: bg.opacity }} />}
      {lines}
      {runs.map(({ key, b, c, r, n }) => {
        const hl = b.id === highlightBlockId;
        return (
          <View
            key={key}
            pointerEvents="none"
            style={{
              position: 'absolute', left: c * z, top: r * z, width: n * z, height: z,
              backgroundColor: tintOthers && !hl ? tint(b.color) : alpha(b.color),
              borderWidth: hl ? 2 : 0, borderColor: noGrid ? '#fff' : C.text,
            }}
          />
        );
      })}
      {blocks.filter((b) => b.cells.length).map((b) => {
        const bb = bbox(b.cells);
        const bw = (bb.c1 - bb.c0 + 1) * z;
        if (bw < 40 || z < 6) return null;
        return (
          <View
            key={b.id}
            pointerEvents="none"
            style={{ position: 'absolute', left: bb.c0 * z, top: bb.r0 * z, width: bw, height: (bb.r1 - bb.r0 + 1) * z, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: C.text }}>{b.name}</Text>
          </View>
        );
      })}
      {onCellPress && (
        <Pressable
          style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}
          onPress={(e) => {
            const { locationX: x, locationY: y } = e.nativeEvent;
            const c = Math.floor(x / z), r = Math.floor(y / z);
            if (c >= 0 && r >= 0 && c < cols && r < rows) onCellPress(c, r);
          }}
        />
      )}
      {marker && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: marker.c * z - 8, top: marker.r * z - 8, width: 16, height: 16, borderRadius: 8,
            backgroundColor: C.danger, borderWidth: 2, borderColor: '#fff',
          }}
        />
      )}
      {arrow && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: arrow.c * z - 16, top: arrow.r * z - 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${arrow.deg}deg` }] }}
        >
          <Text style={{ fontSize: 28, color: C.danger, lineHeight: 32 }}>▲</Text>
        </View>
      )}
    </View>
  );
}


// Grid + zoom buttons, pannable both ways (vertical ScrollView wrapping a horizontal one).
export function ZoomMap(p: Omit<Props, 'cellSize'> & { height?: number }) {
  const fit = Math.round((Dimensions.get('window').width - 40) / p.cols);
  const [z, setZ] = useState(Math.max(4, Math.min(28, fit)));
  const step = (f: number) => setZ((v) => Math.max(4, Math.min(64, Math.round(v * f))));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Btn title="−" size="sm" variant="outline" onPress={() => step(0.8)} disabled={z <= 4} />
        <Btn title="+" size="sm" variant="outline" onPress={() => step(1.25)} disabled={z >= 64} />
        <Text style={{ color: C.muted }}>{z}px</Text>
      </View>
      <View style={{ height: p.height ?? 360, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' }}>
        <ScrollView nestedScrollEnabled>
          <ScrollView horizontal nestedScrollEnabled>
            <MapGrid {...p} cellSize={z} />
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

// Google-Maps-style navigation view: no grid, the map pans so `center` (you) stays pinned to
// the middle of the viewport. The "you" marker is drawn at viewport center (never hidden/offset).
export function NavMap(p: Omit<Props, 'cellSize' | 'marker' | 'arrow'> & { height?: number; center?: { c: number; r: number }; deg?: number }) {
  const [vp, setVp] = useState({ w: 0, h: p.height ?? 420 });
  const [z, setZ] = useState(34);
  const ctr = p.center ?? { c: p.cols / 2, r: p.rows / 2 };
  const you = !!p.center;
  return (
    <View
      onLayout={(e) => setVp({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[{ overflow: 'hidden', backgroundColor: '#E9EDF2' }, p.height ? { height: p.height, borderRadius: 16 } : { flex: 1 }]}
    >
      {vp.w > 0 && (
        <View style={{ transform: [{ translateX: vp.w / 2 - ctr.c * z }, { translateY: vp.h / 2 - ctr.r * z }] }}>
          <MapGrid {...p} cellSize={z} noGrid />
        </View>
      )}
      {you && vp.w > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: vp.w / 2 - 24, top: vp.h / 2 - 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary + '26' }} />
          {p.deg == null ? (
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.primary, borderWidth: 3, borderColor: '#fff', ...SHADOW }} />
          ) : (
            <View style={{ transform: [{ rotate: `${p.deg}deg` }] }}>
              <Text style={{ fontSize: 34, color: C.primary, lineHeight: 36 }}>▲</Text>
            </View>
          )}
        </View>
      )}
      <View style={{ position: 'absolute', right: SP.md, top: SP.md, gap: SP.sm }}>
        <Btn title="+" size="sm" variant="outline" style={{ ...SHADOW, minWidth: 44 }} onPress={() => setZ((v) => Math.min(80, Math.round(v * 1.25)))} disabled={z >= 80} />
        <Btn title="−" size="sm" variant="outline" style={{ ...SHADOW, minWidth: 44 }} onPress={() => setZ((v) => Math.max(12, Math.round(v * 0.8)))} disabled={z <= 12} />
      </View>
    </View>
  );
}
