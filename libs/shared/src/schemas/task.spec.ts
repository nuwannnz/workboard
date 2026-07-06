import { describe, it, expect } from 'vitest';
import { taskSchema, taskStatusSchema, taskPrioritySchema } from './task';

describe('taskSchema', () => {
  it('parses a valid task and applies array defaults', () => {
    const parsed = taskSchema.parse({
      id: 't1',
      title: 'Write Stage 1 scaffold',
      dueDate: null,
      status: 'open',
      priority: 'high',
      projectId: null,
    });

    expect(parsed.title).toBe('Write Stage 1 scaffold');
    expect(parsed.labels).toEqual([]);
    expect(parsed.linkedNoteIds).toEqual([]);
  });

  it('rejects an empty title', () => {
    const result = taskSchema.safeParse({
      id: 't2',
      title: '',
      dueDate: null,
      status: 'open',
      priority: 'low',
      projectId: null,
    });
    expect(result.success).toBe(false);
  });

  it('constrains status and priority to their enums', () => {
    expect(taskStatusSchema.safeParse('archived').success).toBe(false);
    expect(taskPrioritySchema.safeParse('urgent').success).toBe(false);
    expect(taskStatusSchema.parse('completed')).toBe('completed');
  });
});
