import { CalendarDays, FolderKanban, NotebookPen, LayoutDashboard, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route to navigate to when selected. Areas without a live route (later stages) omit it. */
  to?: string;
}

/**
 * The four navigation areas. Stage 3 wires **Week** to its route (`/week`); the remaining
 * areas stay placeholders (no route yet) until their stages land.
 */
export const navItems: NavItem[] = [
  { id: 'week', label: 'Week', icon: CalendarDays, to: '/week' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, to: '/projects' },
  { id: 'notes', label: 'Notes', icon: NotebookPen, to: '/notes' },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
];
