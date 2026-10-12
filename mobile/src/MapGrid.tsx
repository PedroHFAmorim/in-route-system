import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { bbox } from './logic.ts';
import type { Block } from './store.ts';
import { Btn, C } from './ui.tsx';

type Props = {
  cols: number; rows: number; cellSize: number; blocks: Block[];
  highlightBlockId?: string;
  marker?: { c: number; r: number }; // in cell units (may be fractional); drawn as a dot
  arrow?: { c: number; r: number; deg: number };
  onCellPress?: (c: number, r: number) => void;
  tintOthers?: boolean; // navigation: light tint for non-highlighted blocks
};

const tint = (hex: string) => hex + '55';

export function MapGrid({ cols, rows, cellSize: z, blocks, highlightBlockId, marker, arrow, onCellPress, tintOthers }: Props) {
  const owner = new Map<string, Block>();
  for (const b of blocks) for (const x of b.cells) owner.set(`${x.c},${x.r}`, b);

  const rowsEl = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const b = owner.get(`${c},${r}`);
      const hl = b && b.id === highlightBlockId;
      const faded = b && tintOthers && !hl;
      cells.push(
        <Pressable
          key={c}
          disabled={!onCellPress}
          onPress={() => onCellPress?.(c, r)}
          style={{
            width: z, height: z, borderWidth: hl ? 2 : 0.5, borderColor: hl ? C.text : C.border,
            backgroundColor: b ? (faded ? tint(b.color) : b.color) : '#fff',
          }}
        />,
      );
    }
    rowsEl.push(<View key={r} style={{ flexDirection: 'row' }}>{cells}</View>);
  }

  return (
    <View style={{ width: cols * z, height: rows * z }}>
      {rowsEl}
      {z >= 24 &&
        blocks.filter((b) => b.cells.length).map((b) => {
          const bb = bbox(b.cells);
          return (
            <View
              key={b.id}
              pointerEvents="none"
              style={{ position: 'absolute', left: bb.c0 * z, top: bb.r0 * z, width: (bb.c1 - bb.c0 + 1) * z, height: (bb.r1 - bb.r0 + 1) * z, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: C.text }}>{b.name}</Text>
            </View>
          );
        })}
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
  const [z, setZ] = useState(28);
  const step = (d: number) => setZ((v) => Math.max(12, Math.min(64, v + d)));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Btn title="−" size="sm" variant="outline" onPress={() => step(-4)} disabled={z <= 12} />
        <Btn title="+" size="sm" variant="outline" onPress={() => step(4)} disabled={z >= 64} />
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
