import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { Note } from '@workboard/shared';
import { NotesList } from './notes-list';

afterEach(cleanup);

function note(id: string, title: string): Note {
  return {
    id,
    title,
    markdown: '',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

const notes = [note('n1', 'Alpha plan'), note('n2', 'Beta notes'), note('n3', 'gamma')];

function renderList() {
  return render(
    <NotesList notes={notes} selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />,
  );
}

describe('NotesList — title search (FR-016, research §7)', () => {
  it('filters the list case-insensitively by title', () => {
    renderList();
    expect(screen.getAllByTestId('note-list-item')).toHaveLength(3);

    fireEvent.change(screen.getByTestId('notes-search'), { target: { value: 'beta' } });
    const items = screen.getAllByTestId('note-list-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Beta notes');
  });

  it('matches an uppercase query against lowercase titles', () => {
    renderList();
    fireEvent.change(screen.getByTestId('notes-search'), { target: { value: 'GAMMA' } });
    expect(screen.getAllByTestId('note-list-item')).toHaveLength(1);
  });

  it('shows a defined "no matches" state when nothing matches', () => {
    renderList();
    fireEvent.change(screen.getByTestId('notes-search'), { target: { value: 'zzz' } });
    expect(screen.queryAllByTestId('note-list-item')).toHaveLength(0);
    expect(screen.getByTestId('notes-no-matches')).toBeInTheDocument();
  });

  it('renders an empty-title note as "Untitled" (FR-008)', () => {
    render(
      <NotesList notes={[note('e', '')]} selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />,
    );
    const item = screen.getByTestId('note-list-item');
    expect(within(item).getByText('Untitled')).toBeInTheDocument();
  });
});
