import { requireOptionalNativeModule } from 'expo';

export type NativeReading = { bssid: string; ssid: string; rssi: number; freq: number };
export type ScanResult = { throttled: boolean; readings: NativeReading[] };

// Optional: in Expo Go (or iOS) the module doesn't exist; fail on scan with a clear message instead of crashing at startup.
const native = requireOptionalNativeModule<{ scan(): Promise<ScanResult> }>('WifiScan');

export const scan = (): Promise<ScanResult> =>
  native
    ? native.scan()
    : Promise.reject(new Error('Módulo WifiScan ausente: instale o APK do build (EAS ou expo run:android). O Expo Go não suporta código nativo próprio.'));
