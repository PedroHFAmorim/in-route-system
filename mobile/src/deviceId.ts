import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'inroute:deviceId';
let cached: Promise<string> | null = null;

// UUID v4 sem dependência nova (Math.random + Date.now; não é criptográfico, só identifica o aparelho).
export function uuidv4(): string {
  let t = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (t + Math.random() * 16) % 16 | 0;
    t = Math.floor(t / 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Estável: gerado no 1º uso e guardado. Se o AsyncStorage falhar, vale um id da sessão.
export function getDeviceId(): Promise<string> {
  cached ??= (async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      if (v) return v;
    } catch {}
    const id = uuidv4();
    try { await AsyncStorage.setItem(KEY, id); } catch {}
    return id;
  })();
  return cached;
}
