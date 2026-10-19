import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  primary: '#2557D6', secondary: '#6c757d', success: '#18C29C', warning: '#ffc107', danger: '#dc3545',
  light: '#EEF1F6', border: '#dee2e6', text: '#0F1B3D', muted: '#6c757d',
};
export const PALETTE = ['#0dcaf0', '#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#d63384', '#20c997', '#ffc107'];
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const FS = { sm: 14, md: 16, lg: 20, xl: 24 };
const RADIUS = 12;
// Material-ish elevation, cross-platform (iOS shadow* + Android elevation).
export const SHADOW = { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 } as const;

type Variant = 'primary' | 'outline' | 'secondary' | 'success' | 'danger';
const BG: Record<Variant, string> = { primary: C.primary, outline: '#fff', secondary: C.secondary, success: C.success, danger: C.danger };

export function Btn(p: {
  title: string; onPress: () => void; variant?: Variant; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; style?: ViewStyle;
}) {
  const v = p.variant ?? 'primary';
  const size = p.size ?? 'md';
  const pad = { sm: [SP.xs, SP.md], md: [SP.sm + 2, SP.lg], lg: [SP.md, SP.xl] }[size];
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      style={[
        { backgroundColor: BG[v], borderColor: v === 'outline' ? C.primary : BG[v], borderWidth: 1, borderRadius: RADIUS,
          paddingVertical: pad[0], paddingHorizontal: pad[1], alignItems: 'center', justifyContent: 'center' },
        p.disabled && { opacity: 0.5 },
        p.style,
      ]}
    >
      <Text style={{ color: v === 'outline' ? C.primary : '#fff', fontSize: size === 'sm' ? FS.sm : FS.md, fontWeight: '600' }}>{p.title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onLongPress }: { children: ReactNode; style?: ViewStyle; onLongPress?: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} style={[s.card, style]}>
      {children}
    </Pressable>
  );
}

export function Input({ label, ...rest }: { label?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: SP.md }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.muted} {...rest} style={[s.input, rest.style]} />
    </View>
  );
}

export function Badge({ text, color = C.secondary }: { text: string; color?: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 10, paddingHorizontal: SP.sm, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + SP.md }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={{ marginRight: SP.md }}>
          <Text style={{ fontSize: FS.xl, color: C.primary }}>←</Text>
        </Pressable>
      ) : null}
      <Text style={{ fontSize: FS.lg, fontWeight: '700', color: C.text }}>{title}</Text>
    </View>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: C.light, padding: SP.lg }}>{children}</View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: SP.lg, marginBottom: SP.md, ...SHADOW },
  label: { fontSize: FS.sm, color: C.text, marginBottom: SP.xs, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: RADIUS, backgroundColor: '#fff',
    paddingHorizontal: SP.md, paddingVertical: SP.sm, fontSize: FS.md, color: C.text,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', zIndex: 10,
    paddingHorizontal: SP.lg, paddingVertical: SP.md, ...SHADOW,
  },
});
