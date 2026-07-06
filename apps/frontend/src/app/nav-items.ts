import { CalendarDays, FolderKanban, NotebookPen, LayoutDashboard, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The four Stage 1 navigation areas. These are placeholders — no feature
 * behavior is wired (FR-018); they exist to prove the shared shell renders
 * identically on PWA and desktop.
 */
export const navItems: NavItem[] = [
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
];
