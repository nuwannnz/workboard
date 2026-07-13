import { useNavigate } from 'react-router-dom';
import { displayTitle } from './notes-list';
import { useLinkedNotes, type LinkedNotesRef } from './use-linked-notes';

export type LinkedNotesSectionProps = LinkedNotesRef;

/**
 * Reusable "Linked notes" section (contracts §Linked notes on projects & tasks, FR-011/FR-012).
 * Dropped into the project detail page and the Week task dialog; driven by `useLinkedNotes` over
 * the reverse read. Each note opens into the Notes surface (`/notes/:id`); an item with no
 * linked notes shows a defined empty state (US4.4). One shared component keeps the UX identical
 * on both surfaces (Principle II).
 */
export function LinkedNotesSection(props: LinkedNotesSectionProps) {
  const navigate = useNavigate();
  const { notes, loadStatus, isEmpty } = useLinkedNotes(props);

  return (
    <section aria-label="Linked notes" data-testid="linked-notes-section" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Linked notes</h3>

      {loadStatus === 'loading' ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : loadStatus === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load linked notes.
        </p>
      ) : isEmpty ? (
        <p className="text-xs text-muted-foreground" data-testid="linked-notes-empty">
          No linked notes.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => navigate(`/notes/${n.id}`)}
                data-testid="linked-note"
                className="w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
              >
                {displayTitle(n)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
