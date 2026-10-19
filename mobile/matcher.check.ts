import { fuse, keep, rank, rankBle, type Reading, type Sample } from './matcher.ts';

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
const bl = (name: string, ...ble: Reading[]): Sample => ({ name, createdAt: '', readings: [], ble });
const bs = [bl('A', R('11:00:00:00:00:01', '', -50), R('11:00:00:00:00:02', '', -60)), bl('B', R('11:00:00:00:00:01', '', -80), R('11:00:00:00:00:02', '', -40))];
const q = [R('11:00:00:00:00:01', '', -50), R('11:00:00:00:00:02', '', -60), R('11:00:00:00:00:77', '', -50)]; // 77 = transient phone
const rb = rankBle(q, bs);
assert(rb[0].name === 'A' && rb[0].dist === 0, 'BLE: intersecao ignora dispositivo transitorio');
const M = (name: string, dist: number) => ({ name, dist, common: 3 });
assert(fuse(M('A', 5), M('B', 2))!.name === 'A' && fuse(M('A', 5), M('B', 2))!.source === 'wifi', 'fuse prefere wifi seguro');
const fb = fuse(null, M('B', 2))!;
assert(fb.name === 'B' && fb.source === 'ble' && fb.sure, 'fuse cai para BLE seguro');
assert(fuse(M('A', 5), M('A', 2))!.source === 'both', 'fuse: acordo = both');
assert(!fuse(M('A', 20), null)!.sure && fuse(null, null) === null, 'fuse inseguro / nulo');
console.log('matcher OK');
