import { describe, it, expect } from 'vitest';
import { noteSchema, createNoteSchema, updateNoteSchema } from './note';

describe('noteSchema', () => {
  it('accepts an empty title (FR-008) and defaults links to []', () => {
    const parsed = noteSchema.parse({
      id: 'n1',
      title: '',
      markdown: '',
      createdAt: '2026-07-10T09:00:00.000Z',
      updatedAt: '2026-07-10T09:00:00.000Z',
    });
    expect(parsed.title).toBe('');
    expect(parsed.linkedProjectIds).toEqual([]);
    expect(parsed.linkedTaskIds).toEqual([]);
  });

  it('defaults title/markdown/link arrays when omitted', () => {
    const parsed = noteSchema.parse({
      id: 'n1',
      createdAt: '2026-07-10T09:00:00.000Z',
      updatedAt: '2026-07-10T09:00:00.000Z',
    });
    expect(parsed.title).toBe('');
    expect(parsed.markdown).toBe('');
    expect(parsed.linkedProjectIds).toEqual([]);
    expect(parsed.linkedTaskIds).toEqual([]);
  });

  it('carries link arrays through when present', () => {
    const parsed = noteSchema.parse({
      id: 'n1',
      title: 'T',
      markdown: '# Hi',
      linkedProjectIds: ['p1'],
      linkedTaskIds: ['t1', 't2'],
      createdAt: '2026-07-10T09:00:00.000Z',
      updatedAt: '2026-07-10T09:00:00.000Z',
    });
    expect(parsed.linkedProjectIds).toEqual(['p1']);
    expect(parsed.linkedTaskIds).toEqual(['t1', 't2']);
  });
});

describe('createNoteSchema (POST /notes body)', () => {
  it('accepts an empty body — auto-save-first create (FR-008)', () => {
    expect(createNoteSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an optional title and markdown', () => {
    const parsed = createNoteSchema.parse({ title: 'Ideas', markdown: '- one' });
    expect(parsed.title).toBe('Ideas');
    expect(parsed.markdown).toBe('- one');
  });
});

describe('updateNoteSchema (PATCH /notes/:id body)', () => {
  it('accepts a partial body (any subset, including empty)', () => {
    expect(updateNoteSchema.safeParse({}).success).toBe(true);
    expect(updateNoteSchema.safeParse({ markdown: '## H' }).success).toBe(true);
    expect(updateNoteSchema.safeParse({ linkedProjectIds: ['p1'] }).success).toBe(true);
    expect(updateNoteSchema.safeParse({ linkedTaskIds: ['t1'] }).success).toBe(true);
  });

  it('allows an empty title on the content/rename path (FR-008)', () => {
    expect(updateNoteSchema.safeParse({ title: '' }).success).toBe(true);
  });

  it('rejects a non-string in a link array', () => {
    expect(updateNoteSchema.safeParse({ linkedProjectIds: [1] }).success).toBe(false);
  });
});
