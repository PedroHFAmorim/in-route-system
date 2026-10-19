import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE } from './config.ts';
import { getDeviceId } from './deviceId.ts';
import { parseSession, sessionFromLogin, type AuthUser, type Session } from './authLogic.ts';

const KEY = 'inroute:auth';

// Cache em memória: o storage só é lido uma vez (initAuth); depois cada request usa a variável.
let session: Session | null = null;
let loaded: Promise<void> | null = null;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Avisa a UI quando entra/sai sessão (login, logout, 401). Devolve a função de cancelar.
export function onAuthChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// Lê o storage uma única vez. Storage com defeito = sem sessão (cai no login).
export function initAuth(): Promise<void> {
  loaded ??= (async () => {
    try { session = parseSession(await AsyncStorage.getItem(KEY)); } catch { session = null; }
    ready = true;
    emit();
  })();
  return loaded;
}
export const isAuthReady = () => ready;

export async function getToken(): Promise<string | null> {
  await initAuth();
  return session?.token ?? null;
}
export const getUser = (): AuthUser | null => session?.user ?? null;
export const isAuthed = () => !!session;

async function setSession(s: Session | null) {
  session = s;
  try { s ? await AsyncStorage.setItem(KEY, JSON.stringify(s)) : await AsyncStorage.removeItem(KEY); } catch {}
  emit();
}

// Sessão inválida/expirada (401): limpa e avisa a UI. Não mexe na fila de scans.
export async function clearSession() {
  await initAuth();
  if (session) await setSession(null);
}
export const logout = clearSession;

// Erro legível pra mostrar na tela de login.
export class LoginError extends Error {}

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!BASE) throw new LoginError('API não configurada');
  let res: Response;
  try {
    res = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': await getDeviceId() },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch {
    throw new LoginError('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  if (res.status === 401) throw new LoginError('E-mail ou senha inválidos.');
  if (!res.ok) throw new LoginError(`Servidor indisponível (erro ${res.status}). Tente de novo em instantes.`);
  const s = sessionFromLogin(await res.json().catch(() => null));
  if (!s) throw new LoginError('Resposta inesperada do servidor.');
  await initAuth();
  await setSession(s);
  return s.user;
}
