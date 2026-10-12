import { arrowDeg, bbox, blockCenter, budgetWaitMs, formatDist, haversineM, rectCells } from './logic.ts';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error('selftest: ' + msg);
}

assert(budgetWaitMs([1000, 2000, 3000], 10000) === 0, '3 scans -> 0');
assert(budgetWaitMs([1000, 2000, 3000, 4000], 10000) === 111000, '4 scans -> espera');
assert(budgetWaitMs([-500000, 1000, 2000, 3000], 10000) === 0, 'scan antigo ignorado');
assert(budgetWaitMs([1000, 2000, 3000, 4000, 5000], 10000) === 112000, '5 scans');
assert(arrowDeg(10, 350) === 20, 'wrap');
assert(arrowDeg(350, 10) === 340, 'wrap neg');
assert(arrowDeg(90, 90) === 0, 'zero');
assert(rectCells({ c: 3, r: 1 }, { c: 1, r: 2 }).length === 6, 'rect');
const cells = [{ c: 1, r: 1 }, { c: 3, r: 2 }];
const b = bbox(cells);
assert(b.c0 === 1 && b.r0 === 1 && b.c1 === 3 && b.r1 === 2, 'bbox');
const ctr = blockCenter(cells);
assert(ctr.c === 2.5 && ctr.r === 2, 'center');
assert(formatDist(85) === '85 m' && formatDist(1200) === '1,2 km', 'formatDist');
assert(Math.abs(haversineM(0, 0, 0, 1) - 111195) < 200, 'haversine');
console.log('logic OK');
