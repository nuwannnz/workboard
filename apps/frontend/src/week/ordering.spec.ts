import { describe, it, expect } from 'vitest';
import { append, between } from './ordering';

/**
 * Fractional-index ordering (research §4, SC-004): `append` lands after the last rank;
 * `between` yields a rank strictly between two neighbors; and repeated inserts between the
 * same pair keep producing valid, correctly-sorting ranks with no precision collapse.
 */
describe('append', () => {
  it('returns a base rank for an empty day', () => {
    expect(append()).toBeTruthy();
    expect(append(undefined)).toBe(append());
  });

  it('lands strictly after the last rank', () => {
    let last = append();
    for (let i = 0; i < 100; i++) {
      const next = append(last);
      expect(last < next).toBe(true);
      last = next;
    }
  });
});

describe('between', () => {
  it('returns a base rank when both neighbors are undefined', () => {
    expect(between()).toBe(append());
  });

  it('yields a rank strictly between two neighbors', () => {
    const a = append();
    const b = append(a);
    const mid = between(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('inserts before the first when only next is given', () => {
    const first = append();
    const before = between(undefined, first);
    expect(before < first).toBe(true);
  });

  it('appends after the last when only prev is given', () => {
    const last = append();
    const after = between(last, undefined);
    expect(last < after).toBe(true);
  });

  it('survives repeated inserts between the same pair (no precision collapse)', () => {
    let lo = append();
    const hi = append(lo);
    const generated: string[] = [];
    // Always insert just above `lo`, closing in on the same pair repeatedly.
    for (let i = 0; i < 200; i++) {
      const mid = between(lo, hi);
      expect(lo < mid).toBe(true);
      expect(mid < hi).toBe(true);
      generated.push(mid);
      lo = mid;
    }
    // Every generated rank is distinct and strictly increasing.
    const sorted = [...generated].sort();
    expect(sorted).toEqual(generated);
    expect(new Set(generated).size).toBe(generated.length);
  });

  it('keeps a stable sort when many cards are inserted at the front', () => {
    let first = append();
    const ranks = [first];
    for (let i = 0; i < 50; i++) {
      const r = between(undefined, first);
      expect(r < first).toBe(true);
      first = r;
      ranks.unshift(r);
    }
    expect([...ranks].sort()).toEqual(ranks);
  });
});
