import { useNavigate, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { navItems } from './nav-items';
import { Button } from '../components/ui/button';
import { useAuth } from '../auth/use-auth';

/**
 * Responsive app shell. A left sidebar lists the Week / Projects / Notes / Overview areas
 * from the shared design system, plus a Log Out action. Feature routes render in the main
 * area via `<Outlet/>`. The same component renders in the browser PWA and the Tauri desktop
 * window (Principle II).
 */
export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        aria-label="Primary"
        className="flex w-16 flex-col gap-1 border-r border-border bg-muted p-2 sm:w-56"
      >
        <div className="px-2 py-3 text-lg font-semibold">
          <span className="hidden sm:inline">WorkBoard</span>
          <span className="sm:hidden">WB</span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ id, label, icon: Icon, to }) => (
            <Button
              key={id}
              variant="ghost"
              className="w-full justify-start gap-3"
              data-testid={`nav-${id}`}
              disabled={!to}
              onClick={to ? () => navigate(to) : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            data-testid="logout"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
