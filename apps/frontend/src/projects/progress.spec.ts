import { describe, it, expect } from 'vitest';
import type { Task } from '@workboard/shared';
import { progress } from './progress';

function task(status: Task['status']): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'T',
    dueDate: null,
    status,
    priority: 'medium',
    labels: [],
    order: 'V',
    projectId: 'p1',
    linkedNoteIds: [],
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };
}

describe('progress', () => {
  it('counts total and completed and computes ratio + percent', () => {
    const p = progress([task('completed'), task('open'), task('completed'), task('open')]);
    expect(p.total).toBe(4);
    expect(p.completed).toBe(2);
    expect(p.ratio).toBe(0.5);
    expect(p.percent).toBe(50);
  });

  it('rounds the percent', () => {
    const p = progress([task('completed'), task('open'), task('open')]); // 1/3
    expect(p.percent).toBe(33);
  });

  it('is zero-safe for an empty backlog (no division artifact) (FR-010)', () => {
    const p = progress([]);
    expect(p).toEqual({ total: 0, completed: 0, ratio: 0, percent: 0 });
  });

  it('is 100% when all tasks are completed', () => {
    const p = progress([task('completed'), task('completed')]);
    expect(p.ratio).toBe(1);
    expect(p.percent).toBe(100);
  });
});
