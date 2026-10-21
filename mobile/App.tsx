import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, PermissionsAndroid, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { Btn, Header } from './src/ui.tsx';
import Home from './src/screens/Home.tsx';
import PlaceWizard from './src/screens/PlaceWizard.tsx';
import Navigate from './src/screens/Navigate.tsx';
import Login from './src/screens/Login.tsx';
import { api, apiEnabled } from './src/api.ts';
import { initAuth, isAuthed, isAuthReady, onAuthChange } from './src/auth.ts';
import { pickScreen } from './src/authLogic.ts';
import { flush } from './src/scanQueue.ts';
import { startBleSession, startConnWatch, startPassive, stopBleSession, stopConnWatch, stopPassive } from './src/scanner.ts';

export type Route =
  | { name: 'home' }
  | { name: 'wizard'; params?: { placeId?: string; step?: 1 | 2 | 3 } }
  | { name: 'navigate'; params: { placeId: string } };
export type Nav = { push: (r: Route) => void; pop: () => void; replaceAll: (r: Route) => void };

const TITLES = { home: 'Lugares próximos', wizard: 'Novo lugar', navigate: 'Navegação' };

// Android não tem permissão "Wi-Fi" própria: o scan exige Localização (e "Dispositivos próximos" no Android 13+)
// + a localização do sistema ligada. Sem isso o scan volta vazio, então avisamos aqui.
type Access = null | 'denied' | 'gps-off';
async function checkAccess(): Promise<Access> {
  if (Platform.OS !== 'android') return null;
  const perms = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (Platform.Version >= 33) perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  const ble = Platform.Version >= 31 ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] : [];
  const res = await PermissionsAndroid.requestMultiple([...perms, ...ble]); // BLE is optional: not checked below
  if (!perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED)) return 'denied';
  return (await Location.hasServicesEnabledAsync()) ? null : 'gps-off';
}

export default function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nav: Nav = {
    push: (r) => setStack((s) => [...s, r]),
    pop,
    replaceAll: (r) => setStack([r]),
  };

  const topName = useRef<Route['name']>('home');
  topName.current = stack[stack.length - 1].name;
  const [access, setAccess] = useState<Access>(null);
  useEffect(() => {
    const check = () => checkAccess().then(setAccess).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        check(); // volta das configurações
        // As telas só ligam as fontes ao montar; ao voltar do background religa se alguma delas está aberta.
        // Navigate usa as três; o editor (wizard) não usa conn watch. Home não usa nenhuma.
        if (topName.current !== 'home') { startPassive().catch(() => {}); startBleSession().catch(() => {}); }
        if (topName.current === 'navigate') startConnWatch().catch(() => {});
      } else if (st === 'background') {
        // Sem receiver nem rádio BLE varrendo à toa com o app fora de vista (bateria).
        stopPassive().catch(() => {});
        stopBleSession().catch(() => {});
        stopConnWatch().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false;
      pop();
      return true;
    });
    return () => sub.remove();
  }, [stack.length]);

  // Login: só com API ligada. Sem API o app é offline e nunca pede e-mail/senha.
  const [, setAuthTick] = useState(0);
  useEffect(() => {
    if (!apiEnabled()) return;
    const off = onAuthChange(() => setAuthTick((n) => n + 1));
    initAuth().then(() => {
      if (!isAuthed()) return;
      // Valida o token em segundo plano. 401 já limpa a sessão (volta pro login); erro de rede = segue (modo campo).
      api.me().catch(() => {}); // 401 já foi tratado dentro do req
    });
    return off;
  }, []);
  const screen = pickScreen({ apiEnabled: apiEnabled(), ready: isAuthReady(), authed: isAuthed() });
  useEffect(() => {
    if (screen === 'login') setStack([{ name: 'home' }]); // próximo login começa limpo
    if (screen === 'app') flush(); // reenvia o que ficou na fila (ex.: após 401)
  }, [screen]);

  if (screen !== 'app') {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="dark" />
          {screen === 'login' && <Login />}
        </View>
      </SafeAreaProvider>
    );
  }

  const top = stack[stack.length - 1];
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
      <Header title={TITLES[top.name]} onBack={stack.length > 1 ? pop : undefined} />
      {access && (
        <View style={{ backgroundColor: '#fff3cd', borderColor: '#ffe69c', borderWidth: 1, padding: 12, gap: 8 }}>
          <Text style={{ color: '#664d03', fontSize: 15 }}>
            {access === 'denied'
              ? 'Sem permissão de Localização / Dispositivos próximos: o app não consegue ler as redes Wi-Fi.'
              : 'A localização do celular está desligada: sem ela o Android não entrega as redes Wi-Fi.'}
          </Text>
          <Btn
            title={access === 'denied' ? 'Abrir configurações do app' : 'Ligar localização'}
            variant="secondary"
            size="sm"
            onPress={() => (access === 'denied' ? Linking.openSettings() : Location.enableNetworkProviderAsync().catch(() => {}))}
          />
        </View>
      )}
      {top.name === 'home' && <Home nav={nav} />}
      {top.name === 'wizard' && <PlaceWizard key={stack.length} nav={nav} {...top.params} />}
      {top.name === 'navigate' && <Navigate placeId={top.params.placeId} />}
      </View>
    </SafeAreaProvider>
  );
}
