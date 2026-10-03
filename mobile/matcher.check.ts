import { keep, rank, type Reading, type Sample } from './matcher.ts';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error('selftest: ' + msg);
}

const R = (bssid: string, ssid: string, rssi: number): Reading => ({ bssid, ssid, rssi });
const S = (name: string, ...readings: Reading[]): Sample => ({ name, createdAt: '', readings });

const a = S('A', R('a4:00:00:00:00:01', 'w', -40), R('a4:00:00:00:00:02', 'w', -80), R('a4:00:00:00:00:03', 'w', -70));
const b = S('B', R('a4:00:00:00:00:01', 'w', -80), R('a4:00:00:00:00:02', 'w', -40), R('a4:00:00:00:00:03', 'w', -70));
const c = S('C', R('a4:00:00:00:00:01', 'w', -60), R('a4:00:00:00:00:02', 'w', -60), R('a4:00:00:00:00:09', 'w', -50));

assert(rank(a.readings, [a, b, c])[0].name === 'A', 'A deveria vir primeiro');
assert(rank([R('bb:00:00:00:00:01', 'x', -50), R('bb:00:00:00:00:02', 'x', -50)], [a, b, c]).length === 0, 'sem APs em comum');
assert(!keep(R('a4:00:00:00:00:05', 'rede_nomap', -50)), '_nomap');
assert(!keep(R('02:11:22:33:44:55', 'x', -50)), 'localmente administrado');
assert(!keep(R('a4:00:00:00:00:05', 'x', -95)), 'rssi fraco');
assert(keep(R('a4:00:00:00:00:05', 'ok', -50)), 'leitura valida');
console.log('matcher OK');
