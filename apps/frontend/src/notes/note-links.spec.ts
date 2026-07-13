import { describe, it, expect } from 'vitest';
import { dedup, resolve, pruneStale } from './note-links';

const projects = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
];

describe('note-links helpers (research §4)', () => {
  it('dedup removes repeats, preserving first-seen order', () => {
    expect(dedup(['p1', 'p2', 'p1', 'p2', 'p3'])).toEqual(['p1', 'p2', 'p3']);
  });

  it('resolve maps ids to known items and omits stale ids (FR-014)', () => {
    const resolved = resolve(['p2', 'gone', 'p1'], projects);
    expect(resolved.map((p) => p.id)).toEqual(['p2', 'p1']); // order preserved, 'gone' omitted
  });

  it('resolve returns [] when nothing resolves', () => {
    expect(resolve(['x', 'y'], projects)).toEqual([]);
  });

  it('pruneStale drops ids that no longer resolve', () => {
    expect(pruneStale(['p1', 'gone', 'p2'], projects)).toEqual(['p1', 'p2']);
  });

  it('pruneStale is a no-op when every id resolves', () => {
    expect(pruneStale(['p1', 'p2'], projects)).toEqual(['p1', 'p2']);
  });
});
