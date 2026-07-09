import { describe, it, expect } from 'vitest';
import {
  taskSchema,
  taskStatusSchema,
  taskPrioritySchema,
  createTaskSchema,
  updateTaskSchema,
} from './task';

describe('taskSchema', () => {
  it('parses a valid task and applies defaults', () => {
    const parsed = taskSchema.parse({
      id: 't1',
      title: 'Write Stage 3 board',
      dueDate: '2026-07-08',
      status: 'open',
      priority: 'high',
      order: 'a0',
      projectId: null,
      createdAt: '2026-07-08T09:00:00.000Z',
      updatedAt: '2026-07-08T09:00:00.000Z',
    });

    expect(parsed.title).toBe('Write Stage 3 board');
    expect(parsed.labels).toEqual([]);
    expect(parsed.linkedNoteIds).toEqual([]);
    expect(parsed.order).toBe('a0');
  });

  it('rejects an empty title', () => {
    const result = taskSchema.safeParse({
      id: 't2',
      title: '',
      dueDate: null,
      status: 'open',
      priority: 'low',
      order: 'a0',
      projectId: null,
      createdAt: '2026-07-08T09:00:00.000Z',
      updatedAt: '2026-07-08T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('constrains status and priority to their enums', () => {
    expect(taskStatusSchema.safeParse('archived').success).toBe(false);
    expect(taskPrioritySchema.safeParse('urgent').success).toBe(false);
    expect(taskStatusSchema.parse('completed')).toBe('completed');
  });
});

describe('createTaskSchema (POST /tasks body)', () => {
  it('accepts a valid create body and defaults priority to medium', () => {
    const parsed = createTaskSchema.parse({ title: 'Draft notes', dueDate: '2026-07-08' });
    expect(parsed.title).toBe('Draft notes');
    expect(parsed.priority).toBe('medium');
  });

  it('trims and rejects an empty / whitespace-only title (FR-004)', () => {
    expect(createTaskSchema.safeParse({ title: '', dueDate: '2026-07-08' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: '   ', dueDate: '2026-07-08' }).success).toBe(false);
    const trimmed = createTaskSchema.parse({ title: '  hello  ', dueDate: '2026-07-08' });
    expect(trimmed.title).toBe('hello');
  });

  it('rejects a malformed or unreal dueDate', () => {
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '07-08-2026' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '2026-7-8' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '2026-13-01' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '2026-02-30' }).success).toBe(false);
  });

  it('allows omitting dueDate for a backlog-only task, and accepts a projectId (Stage 4)', () => {
    // Backlog inline-add: title + projectId, no dueDate.
    const backlog = createTaskSchema.parse({ title: 'Backlog item', projectId: 'p1' });
    expect(backlog.dueDate).toBeUndefined();
    expect(backlog.projectId).toBe('p1');

    // Scheduled project task: title + dueDate + projectId.
    const scheduled = createTaskSchema.parse({
      title: 'Scheduled',
      dueDate: '2026-07-08',
      projectId: 'p1',
    });
    expect(scheduled.dueDate).toBe('2026-07-08');
    expect(scheduled.projectId).toBe('p1');
  });

  it('still rejects a malformed dueDate when present', () => {
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: 'nope' }).success).toBe(false);
  });
});

describe('updateTaskSchema (PATCH /tasks/:id body)', () => {
  it('accepts a partial body (any single field)', () => {
    expect(updateTaskSchema.safeParse({ status: 'completed' }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ dueDate: '2026-07-10', order: 'a3' }).success).toBe(true);
    expect(updateTaskSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty title when the field is present (Story 5.6)', () => {
    expect(updateTaskSchema.safeParse({ title: '' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: 'renamed' }).success).toBe(true);
  });

  it('rejects a malformed dueDate when present', () => {
    expect(updateTaskSchema.safeParse({ dueDate: 'nope' }).success).toBe(false);
  });

  it('accepts dueDate: null and projectId: null to clear/unbind (Stage 4, FR-013)', () => {
    expect(updateTaskSchema.safeParse({ dueDate: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ projectId: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ projectId: 'p2' }).success).toBe(true);
  });
});
