import { Text, View } from 'react-native';
import type { Reading } from '../matcher.ts';
import { C, SHADOW } from './ui.tsx';

// Floating white-label signal chart. One horizontal bar per network, length ∝ signal strength.
// Ordered with the STRONGEST at the bottom and weaker ones stacked upward.
const frac = (rssi: number) => Math.max(0.08, Math.min(1, (rssi + 95) / 65)); // -95..-30 dBm → 0..1
const barColor = (rssi: number) => (rssi >= -60 ? C.success : rssi >= -75 ? C.warning : C.danger);

export function SignalChart({ readings, max = 7, bottom = 12 }: { readings: Reading[]; max?: number; bottom?: number }) {
  if (!readings.length) return null;
  // weakest first → rendered top-to-bottom, so the strongest ends up at the bottom.
  const rows = [...readings].sort((a, b) => a.rssi - b.rssi).slice(-max);
  return (
    <View style={{ position: 'absolute', left: 12, bottom, width: 168, backgroundColor: '#fffffff2', borderRadius: 12, padding: 8, ...SHADOW }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: C.muted, marginBottom: 4 }}>SINAL DAS REDES</Text>
      {rows.map((r) => (
        <View key={r.bssid} style={{ marginVertical: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ height: 8, borderRadius: 4, flex: frac(r.rssi), backgroundColor: barColor(r.rssi) }} />
            <View style={{ flex: 1 - frac(r.rssi) }} />
            <Text style={{ fontSize: 9, color: C.muted, width: 30, textAlign: 'right' }}>{r.rssi}</Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 9, color: C.text }}>{r.ssid || r.bssid.slice(-8)}</Text>
        </View>
      ))}
    </View>
  );
}
