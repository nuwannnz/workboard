import { useMemo, useState } from 'react';
import type { Note } from '@workboard/shared';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/** Display-only placeholder for an empty title (FR-008) — never stored (research §7). */
export function displayTitle(note: Pick<Note, 'title'>): string {
  return note.title.trim() ? note.title : 'Untitled';
}

/**
 * Notes master pane (contracts/notes-client-contract.md §Notes list). Renders the owner's notes
 * in recency order with an empty-title note shown as **"Untitled"**, a "New note" control, and a
 * client-side, case-insensitive **title** search over the already-loaded list with a defined
 * "no matches" state (FR-016, research §7 — no network call). Selecting a note calls `onSelect`
 * (the page navigates to `/notes/:id`).
 */
export function NotesList({ notes, selectedId, onSelect, onCreate }: NotesListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => displayTitle(n).toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-r border-border bg-muted/20" data-testid="notes-list">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes by title"
          data-testid="notes-search"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          size="sm"
          onClick={onCreate}
          data-testid="new-note"
          className="shrink-0 whitespace-nowrap"
        >
          New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No notes yet. Create your first note to get started.
          </p>
          <Button type="button" onClick={onCreate}>
            New note
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground" data-testid="notes-no-matches">
          No notes match “{query}”.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {filtered.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onSelect(note.id)}
                data-testid="note-list-item"
                aria-current={note.id === selectedId}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-muted/50',
                  note.id === selectedId && 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    !note.title.trim() && 'text-muted-foreground italic',
                  )}
                >
                  {displayTitle(note)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
