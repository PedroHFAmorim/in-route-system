// Lógica pura da autenticação (sem React Native / AsyncStorage), testável com node.

export type AuthUser = { id: string; email: string; role: string };
export type Session = { token: string; user: AuthUser };

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Qual tela mostrar: sem API nunca há login; com API, sem token → login (depois de ler o storage).
export type Screen = 'loading' | 'login' | 'app';
export function pickScreen(s: { apiEnabled: boolean; ready: boolean; authed: boolean }): Screen {
  if (!s.apiEnabled) return 'app';
  if (!s.ready) return 'loading';
  return s.authed ? 'app' : 'login';
}

// Lê o que foi guardado no storage; qualquer coisa fora do formato esperado vale como "sem sessão".
export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.token === 'string' && v.token && v.user && typeof v.user.email === 'string') {
      return { token: v.token, user: { id: String(v.user.id ?? ''), email: v.user.email, role: String(v.user.role ?? '') } };
    }
  } catch {}
  return null;
}

// Resposta do /auth/login em sessão; null se vier fora do contrato.
export function sessionFromLogin(body: unknown): Session | null {
  const b = body as { token?: unknown; user?: { id?: unknown; email?: unknown; role?: unknown } } | null;
  if (!b || typeof b.token !== 'string' || !b.token || !b.user || typeof b.user.email !== 'string') return null;
  return { token: b.token, user: { id: String(b.user.id ?? ''), email: b.user.email, role: String(b.user.role ?? '') } };
}
