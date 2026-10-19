// Linha do banco -> formato que o app espera (mobile/src/store.ts, Place).
export type PlaceRow = {
  id: string; name: string; typeId: string | null; lat: number | null; lng: number | null;
  address: string | null; createdAt: Date; map: unknown | null;
};

export function placeToResponse(r: PlaceRow) {
  return {
    id: r.id,
    name: r.name,
    typeId: r.typeId ?? '',
    lat: r.lat,
    lng: r.lng,
    address: r.address ?? undefined,
    createdAt: r.createdAt.toISOString(),
    map: r.map ?? undefined,
  };
}
