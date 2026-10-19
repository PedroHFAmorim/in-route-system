import { placeToResponse } from './place.mapper';

describe('placeToResponse', () => {
  const d = new Date('2026-10-19T20:00:00.000Z');
  it('typeId nulo vira string vazia, data em ISO, address/map nulos viram undefined', () => {
    const r = placeToResponse({ id: 'p1', name: 'X', typeId: null, lat: null, lng: null, address: null, createdAt: d, map: null });
    expect(r).toEqual({ id: 'p1', name: 'X', typeId: '', lat: null, lng: null, address: undefined, createdAt: '2026-10-19T20:00:00.000Z', map: undefined });
  });
  it('preserva campos preenchidos e o mapa', () => {
    const map = { cols: 1, rows: 1, blocks: [] };
    const r = placeToResponse({ id: 'p2', name: 'Y', typeId: 't1', lat: -1.5, lng: 2.5, address: 'Rua', createdAt: d, map });
    expect(r).toMatchObject({ typeId: 't1', lat: -1.5, lng: 2.5, address: 'Rua', map });
  });
});
