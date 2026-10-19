import { isValidEmail, normalizeEmail, parseSession, pickScreen, sessionFromLogin } from './authLogic.ts';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error('auth selftest: ' + msg);
}

assert(isValidEmail('a@b.co') && isValidEmail(' ana@mobs2.com '), 'e-mail válido');
assert(!isValidEmail('') && !isValidEmail('ana') && !isValidEmail('ana@') && !isValidEmail('a b@c.com') && !isValidEmail('a@b'), 'e-mail inválido');
assert(normalizeEmail('  Ana@Mobs2.COM ') === 'ana@mobs2.com', 'normaliza');

assert(pickScreen({ apiEnabled: false, ready: false, authed: false }) === 'app', 'sem API: sempre app');
assert(pickScreen({ apiEnabled: false, ready: true, authed: false }) === 'app', 'sem API: nunca login');
assert(pickScreen({ apiEnabled: true, ready: false, authed: false }) === 'loading', 'lendo storage');
assert(pickScreen({ apiEnabled: true, ready: true, authed: false }) === 'login', 'sem token: login');
assert(pickScreen({ apiEnabled: true, ready: true, authed: true }) === 'app', 'com token: app');

const s = parseSession(JSON.stringify({ token: 't', user: { id: '1', email: 'a@b.co', role: 'admin' } }));
assert(s?.token === 't' && s.user.email === 'a@b.co', 'parse ok');
assert(parseSession(null) === null && parseSession('lixo') === null && parseSession('{}') === null && parseSession('{"token":"","user":{}}') === null, 'parse inválido');
assert(sessionFromLogin({ token: 'x', expiresIn: 1, user: { id: 'u', email: 'a@b.co', role: 'user' } })?.user.id === 'u', 'login ok');
assert(sessionFromLogin({ user: {} }) === null && sessionFromLogin(null) === null, 'login fora do contrato');

console.log('auth OK');
