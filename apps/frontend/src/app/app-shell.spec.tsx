import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from './app-shell';

afterEach(cleanup);

/**
 * Sample component test (T016): the shared shell renders the four nav areas
 * (Week / Projects / Notes / Overview). Proves the frontend test layer is wired.
 */
describe('AppShell', () => {
  it('renders the four navigation placeholders', () => {
    render(<AppShell />);
    for (const label of ['Week', 'Projects', 'Notes', 'Overview']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('exposes a nav item test id for each area', () => {
    render(<AppShell />);
    for (const id of ['week', 'projects', 'notes', 'overview']) {
      expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument();
    }
  });
});
