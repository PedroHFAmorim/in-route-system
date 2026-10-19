// Open reverse geocoding via OpenStreetMap Nominatim (no API key). Usage policy: <=1 req/s, real User-Agent.
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`;
  const res = await fetch(url, { headers: { 'User-Agent': 'InRoute-App/1.0 (indoor mapping poc)' } });
  if (!res.ok) throw new Error(`Geocode falhou (HTTP ${res.status})`);
  const j = (await res.json()) as { display_name?: string; error?: string };
  if (!j.display_name) throw new Error(j.error || 'Endereço não encontrado');
  return j.display_name;
}
