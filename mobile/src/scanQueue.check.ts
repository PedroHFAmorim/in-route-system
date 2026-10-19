import { BATCH, MAX_QUEUE, capQueue, chunk, removeConfirmed } from './scanQueue.logic.ts';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error('queue selftest: ' + msg);
}
const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

// corte: mantém os mais novos
assert(capQueue(nums(10)).length === 10, 'sem corte');
const c = capQueue(nums(250));
assert(c.length === MAX_QUEUE && c[0] === 50 && c[199] === 249, 'corte descarta os mais antigos');

// lotes
assert(chunk([]).length === 0, 'vazio');
assert(chunk(nums(50)).length === 1, '50 -> 1 lote');
const ch = chunk(nums(120));
assert(ch.length === 3 && ch[0].length === BATCH && ch[2].length === 20, '120 -> 50/50/20');

// remoção dos confirmados (itens objeto, comparação por referência)
const q = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }];
const sent = q.slice(0, 3);
let r = removeConfirmed(q, sent, ['x', 'y', 'z']);
assert(r.length === 1 && r[0] === q[3], 'todos confirmados');
r = removeConfirmed(q, sent, ['x', null, 'z']);
assert(r.length === 2 && r[0] === q[1] && r[1] === q[3], 'ids alinhados com null');
r = removeConfirmed(q, sent, ['x', 'z'], [1]);
assert(r.length === 2 && r[0] === q[1], 'ids só dos aceitos + failed por índice');
r = removeConfirmed(q, sent, ['x', 'z'], [{ index: 1 }]);
assert(r.length === 2, 'failed como { index }');
assert(removeConfirmed(q, sent, undefined) === q, 'resposta inválida não remove');
assert(removeConfirmed(q, sent, ['x']) === q, 'tamanho incompatível não remove');
assert(removeConfirmed(q, sent, [null, null, null]).length === 4, 'nenhum confirmado');

console.log('queue OK');
