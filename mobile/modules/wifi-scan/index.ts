import { requireOptionalNativeModule } from 'expo';

export type RawReading = { bssid: string; ssid: string; rssi: number; freq: number; ageMs: number };
export type ScanSource = 'cache' | 'active' | 'none';
export type WifiScanResult = {
  readings: RawReading[];
  ageMs: number | null; // idade da leitura MAIS NOVA do lote; null se readings vazio
  source: ScanSource;
  throttled: boolean;
};
export type ScanOpts = { maxAgeMs?: number; allowActive?: boolean; timeoutMs?: number };

export type BleReading = { id: string; name: string; rssi: number };
export type Connected = { bssid: string; ssid: string; rssi: number };

type ConnEvent = { conn: Connected | null };
type ScanEvent = { count: number; ageMs: number | null };

// Optional: in Expo Go (or iOS) the module doesn't exist; fail on scan with a clear message instead of crashing at startup.
const native = requireOptionalNativeModule<{
  scan(maxAgeMs: number, allowActive: boolean, timeoutMs: number): Promise<WifiScanResult>;
  bleScan(ms: number): Promise<BleReading[]>;
  connected(): Promise<Connected | null>;
  startPassive(): Promise<void>;
  stopPassive(): Promise<void>;
  passiveStats(): Promise<{ events: number; lastAgeMs: number | null }>;
  startConnWatch(): Promise<void>;
  stopConnWatch(): Promise<void>;
  startBleSession(): Promise<void>;
  stopBleSession(): Promise<void>;
  bleSnapshot(windowMs: number): Promise<BleReading[]>;
  addListener(name: 'onScanResults', cb: (e: ScanEvent) => void): { remove(): void };
  addListener(name: 'onConn', cb: (e: ConnEvent) => void): { remove(): void };
}>('WifiScan');

const missing = () => Promise.reject(new Error('Módulo WifiScan ausente: instale o APK do build (EAS ou expo run:android). O Expo Go não suporta código nativo próprio.'));

export const scan = (opts: ScanOpts = {}): Promise<WifiScanResult> =>
  native ? native.scan(opts.maxAgeMs ?? 30000, opts.allowActive ?? true, opts.timeoutMs ?? 8000) : missing();
export const bleScan = (ms: number): Promise<BleReading[]> => (native ? native.bleScan(ms) : missing());
export const connected = (): Promise<Connected | null> => (native ? native.connected() : missing());

// Escuta passiva: sem módulo nativo, degrada em no-op (chamado na montagem de telas).
export const startPassive = (): Promise<void> => (native ? native.startPassive() : Promise.resolve());
export const stopPassive = (): Promise<void> => (native ? native.stopPassive() : Promise.resolve());
export const passiveStats = (): Promise<{ events: number; lastAgeMs: number | null }> =>
  native ? native.passiveStats() : Promise.resolve({ events: 0, lastAgeMs: null });
export const addScanResultsListener = (cb: (e: ScanEvent) => void): { remove(): void } =>
  native ? native.addListener('onScanResults', cb) : { remove() {} };

// Rede conectada por evento (RSSI ~a cada 3 s, sem limite). Emite null quando a rede cai.
export const startConnWatch = (): Promise<void> => (native ? native.startConnWatch() : Promise.resolve());
export const stopConnWatch = (): Promise<void> => (native ? native.stopConnWatch() : Promise.resolve());
export const addConnListener = (cb: (c: Connected | null) => void): { remove(): void } =>
  native ? native.addListener('onConn', (e) => cb(e.conn ?? null)) : { remove() {} };

// Sessão BLE contínua (reinicia sozinha a cada ~25 min no nativo). bleSnapshot não espera.
export const startBleSession = (): Promise<void> => (native ? native.startBleSession() : Promise.resolve());
export const stopBleSession = (): Promise<void> => (native ? native.stopBleSession() : Promise.resolve());
export const bleSnapshot = (windowMs: number = 10000): Promise<BleReading[]> =>
  native ? native.bleSnapshot(windowMs) : Promise.resolve([]);
