import { requireOptionalNativeModule } from 'expo';

export type NativeReading = { bssid: string; ssid: string; rssi: number; freq: number };
export type BleReading = { id: string; name: string; rssi: number };
export type Connected = { bssid: string; ssid: string; rssi: number };
export type ScanResult = { throttled: boolean; readings: NativeReading[] };

// Optional: in Expo Go (or iOS) the module doesn't exist; fail on scan with a clear message instead of crashing at startup.
const native = requireOptionalNativeModule<{
  scan(): Promise<ScanResult>;
  bleScan(ms: number): Promise<BleReading[]>;
  connected(): Promise<Connected | null>;
}>('WifiScan');

const missing = () => Promise.reject(new Error('Módulo WifiScan ausente: instale o APK do build (EAS ou expo run:android). O Expo Go não suporta código nativo próprio.'));

export const scan = (): Promise<ScanResult> => (native ? native.scan() : missing());
export const bleScan = (ms: number): Promise<BleReading[]> => (native ? native.bleScan(ms) : missing());
export const connected = (): Promise<Connected | null> => (native ? native.connected() : missing());
