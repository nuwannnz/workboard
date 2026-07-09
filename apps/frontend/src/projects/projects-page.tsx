import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useProjects } from './use-projects';
import { ProjectCard } from './project-card';
import { CreateProjectDialog } from './create-project-dialog';

/**
 * Projects feature container (contracts/projects-client-contract.md §Screens). Owns the
 * projects data hook and renders the cards grid with an empty state and a "New project"
 * control opening the create dialog. Loading and load-failure states are surfaced so the grid
 * never silently shows stale/empty data as saved (FR-018). Opening a card navigates to its
 * detail route.
 */
export function ProjectsPage() {
  const { projects, loadStatus, error, reload, createProject } = useProjects();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <section aria-label="Projects" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button type="button" onClick={() => setCreating(true)} data-testid="new-project">
          New project
        </Button>
      </header>

      {loadStatus === 'error' ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">Could not load your projects.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-sm font-medium text-primary underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {error ? (
            <p
              role="alert"
              className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {loadStatus === 'ready' && projects.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No projects yet. Create your first project to get started.
              </p>
              <Button type="button" onClick={() => setCreating(true)}>
                New project
              </Button>
            </div>
          ) : (
            <div
              data-testid="projects-grid"
              className="grid flex-1 grid-cols-1 content-start gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={(p) => navigate(`/projects/${p.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {creating ? (
        <CreateProjectDialog onClose={() => setCreating(false)} onSubmit={createProject} />
      ) : null}
    </section>
  );
}

export default ProjectsPage;
