import { keep } from './keep';

describe('keep', () => {
  const base = { bssid: '00:11:22:33:44:55', ssid: 'Rede', rssi: -60 };
  it('mantém leitura normal', () => expect(keep(base)).toBe(true));
  it('descarta ssid _nomap (case-insensitive)', () => {
    expect(keep({ ...base, ssid: 'casa_nomap' })).toBe(false);
    expect(keep({ ...base, ssid: 'CASA_NOMAP' })).toBe(false);
  });
  it('descarta BSSID localmente administrado', () => {
    expect(keep({ ...base, bssid: 'aa:bb:cc:dd:ee:ff' })).toBe(false);
    expect(keep({ ...base, bssid: '02:00:00:00:00:00' })).toBe(false);
  });
  it('mantém BSSID universal e sem separador', () => {
    expect(keep({ ...base, bssid: 'a8:bb:cc:dd:ee:ff' })).toBe(true);
    expect(keep({ ...base, bssid: '0011223344aa' })).toBe(true);
  });
  it('descarta rssi < -90 e aceita -90', () => {
    expect(keep({ ...base, rssi: -91 })).toBe(false);
    expect(keep({ ...base, rssi: -90 })).toBe(true);
  });
  it('não quebra com id BLE fora do padrão', () => expect(keep({ bssid: 'zz-ble', rssi: -70 })).toBe(true));
  it('ssid ausente/null não descarta', () => expect(keep({ ...base, ssid: null })).toBe(true));
});
