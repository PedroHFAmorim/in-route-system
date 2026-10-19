// Expo injeta EXPO_PUBLIC_* no build. Definida, o app fala com o backend; ausente, fica offline (sem login).
export const BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
