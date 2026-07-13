import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { Note } from '@workboard/shared';
import { useNoteEditor } from './use-note-editor';

/**
 * Auto-save hook (research §6, FR-005/FR-006, SC-009). Fake timers drive the ~500ms debounce so
 * we assert: one save per pause, a single save under rapid edits, latest-wins on a mid-save
 * edit, and a non-silent `error` that keeps the buffer and retries on the next edit.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function sampleNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: '',
    markdown: '',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

/** A deferred promise so a save can be held "in flight" for the race test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useNoteEditor', () => {
  it('fires one save ~500ms after a pause and moves saving → saved (FR-005)', async () => {
    const save = vi.fn(async (id: string, patch: { title?: string; markdown?: string }) =>
      sampleNote({ ...patch, updatedAt: 'x' }),
    );
    const { result } = renderHook(() => useNoteEditor({ note: sampleNote(), save }));

    act(() => result.current.setTitle('Hello'));
    expect(result.current.status).toBe('dirty');
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('n1', { title: 'Hello', markdown: '' });
    expect(result.current.status).toBe('saved');
  });

  it('resets the timer so a burst of edits yields a single save (SC-009)', async () => {
    const save = vi.fn(async (_id: string, patch: { title?: string; markdown?: string }) =>
      sampleNote(patch),
    );
    const { result } = renderHook(() => useNoteEditor({ note: sampleNote(), save }));

    act(() => result.current.setMarkdown('a'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => result.current.setMarkdown('ab'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => result.current.setMarkdown('abc'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('n1', { title: '', markdown: 'abc' });
  });

  it('an edit during an in-flight save schedules a follow-up so the latest content wins', async () => {
    const first = deferred<Note>();
    const calls: string[] = [];
    const save = vi.fn(async (_id: string, patch: { title?: string; markdown?: string }) => {
      calls.push(patch.markdown ?? '');
      if (calls.length === 1) return first.promise;
      return sampleNote(patch);
    });
    const { result } = renderHook(() => useNoteEditor({ note: sampleNote(), save }));

    act(() => result.current.setMarkdown('v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.status).toBe('saving');

    // Edit again while the first save is still pending.
    act(() => result.current.setMarkdown('v2'));
    // Resolve the first save; the loop should then persist v2.
    await act(async () => {
      first.resolve(sampleNote({ markdown: 'v1' }));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls).toEqual(['v1', 'v2']);
    expect(result.current.status).toBe('saved');
  });

  it('a failed save moves to error, keeps the buffer, and retries on the next edit (FR-006)', async () => {
    let shouldFail = true;
    const save = vi.fn(async (_id: string, patch: { title?: string; markdown?: string }) => {
      if (shouldFail) throw new Error('network');
      return sampleNote(patch);
    });
    const { result } = renderHook(() => useNoteEditor({ note: sampleNote(), save }));

    act(() => result.current.setMarkdown('keep me'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.markdown).toBe('keep me'); // buffer retained

    // Next edit retries and succeeds.
    shouldFail = false;
    act(() => result.current.setMarkdown('keep me!'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.status).toBe('saved');
    expect(save).toHaveBeenLastCalledWith('n1', { title: '', markdown: 'keep me!' });
  });
});
