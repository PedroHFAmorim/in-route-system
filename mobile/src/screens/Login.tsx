import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login } from '../auth.ts';
import { isValidEmail } from '../authLogic.ts';
import { Btn, C, FS, Input, SP } from '../ui.tsx';

// Sem "criar conta": os usuários são criados por um administrador. Ao entrar, o App troca de tela sozinho (onAuthChange).
export default function Login() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    if (!isValidEmail(email)) return setError('Informe um e-mail válido.');
    if (!password) return setError('Informe a senha.');
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.light }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SP.xl, paddingTop: SP.xl + insets.top, paddingBottom: SP.xl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: FS.xl, fontWeight: '700', color: C.text }}>In-Route</Text>
        <Text style={{ color: C.muted, marginBottom: SP.xl, marginTop: SP.xs }}>Entre com a conta criada pelo administrador.</Text>
        <Input
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          editable={!busy}
        />
        <Input
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          editable={!busy}
          onSubmitEditing={submit}
        />
        {error ? <Text style={{ color: C.danger, marginBottom: SP.md }}>{error}</Text> : null}
        <Btn title={busy ? 'Entrando…' : 'Entrar'} size="lg" onPress={submit} disabled={busy} />
        {busy ? <ActivityIndicator style={{ marginTop: SP.md }} color={C.primary} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
