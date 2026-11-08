import { describe, expect, it } from 'vitest';
import { splitBill } from '../src/routes/social';

describe('dividir cuenta', () => {
  it('equitativo incluye a quien pagó y suma exacto', () => {
    const r = splitBill(100, [{ nickname: 'A' }, { nickname: 'B' }], 'equal');
    expect(r.shares.map((s) => s.amount)).toEqual([33.33, 33.33]);
    expect(r.myShare).toBe(33.34);
  });
  it('personalizado', () => {
    const r = splitBill(50, [{ nickname: 'A', amount: 10 }, { nickname: 'B', amount: 15 }], 'custom');
    expect(r.myShare).toBe(25);
  });
  it('falla si se pasa del total', () => {
    expect(() => splitBill(10, [{ nickname: 'A', amount: 20 }], 'custom')).toThrow();
  });
});
