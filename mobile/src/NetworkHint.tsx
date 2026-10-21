import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, FS, SHADOW, SP } from './ui.tsx';

// Conectado, o Android escaneia a cada ~2 min; desconectado (Wi-Fi ligado), busca rede bem mais rápido.
// `conn` null = sem rede conectada (aviso some). Fica sempre montado para lembrar a dispensa na sessão.
export function NetworkHint({ conn, floating }: { conn: { ssid: string } | null; floating?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (!conn || dismissed) return null;
  const ssid = conn.ssid.trim();
  return (
    <View
      style={{
        backgroundColor: '#fffffff2', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: C.primary,
        paddingHorizontal: SP.md, paddingVertical: SP.sm, marginTop: SP.sm, flexDirection: 'row', gap: SP.sm,
        ...(floating ? { maxWidth: 280, ...SHADOW } : { backgroundColor: C.light }),
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: FS.sm, fontWeight: '700', color: C.text }}>Dica: use dados móveis</Text>
        <Text style={{ fontSize: 13, color: C.text, marginTop: 2 }}>
          {ssid ? `Você está conectado à rede "${ssid}". ` : 'Você está conectado a uma rede Wi-Fi. '}
          Desconecte dessa rede, mas NÃO desligue o Wi-Fi: ele precisa continuar ligado para o app ler os sinais. Use os dados móveis para a internet.
        </Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          Assim o aparelho procura redes com muito mais frequência e a localização fica mais precisa.
        </Text>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: SP.xs }}>
          <Text style={{ fontSize: FS.sm, fontWeight: '700', color: C.primary }}>Entendi</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityLabel="Dispensar dica">
        <Text style={{ fontSize: FS.md, color: C.muted }}>✕</Text>
      </Pressable>
    </View>
  );
}
