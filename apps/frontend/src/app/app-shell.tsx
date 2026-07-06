import { navItems } from './nav-items';
import { Button } from '../components/ui/button';
import { getPlatform } from '../platform';

/**
 * Responsive app shell (T022). A left sidebar lists the Week / Projects /
 * Notes / Overview placeholders from the shared design system; the same
 * component renders in the browser PWA and the Tauri desktop window
 * (Principle II). No feature behavior is implemented (FR-018).
 */
export function AppShell() {
  const platform = getPlatform();

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
          {navItems.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className="w-full justify-start gap-3"
              data-testid={`nav-${id}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">WorkBoard</h1>
        <p className="text-muted-foreground">
          Stage 1 foundation — running on the <strong>{platform.name}</strong> platform.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Select an area in the sidebar. Feature behavior arrives in later stages.
        </p>
      </main>
    </div>
  );
}

export default AppShell;
