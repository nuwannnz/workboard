import type { Project } from '@workboard/shared';
import { cn } from '../lib/utils';
import { colorSwatch } from './project-colors';

export interface ProjectCardProps {
  project: Project;
  /** Open the project's detail view. */
  onOpen: (project: Project) => void;
}

/**
 * A single project card (FR-001, US1): shows the project's color accent, name, and optional
 * description. A click opens the detail route. Maps the palette `color` token to shared
 * design-system classes; long names/descriptions wrap without breaking the grid.
 */
export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(project)}
      data-testid={`project-card-${project.id}`}
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left shadow-sm',
        'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('h-3 w-3 shrink-0 rounded-full', colorSwatch(project.color))}
        />
        <span className="break-words font-medium">{project.name}</span>
      </div>
      {project.description ? (
        <p className="break-words text-sm text-muted-foreground">{project.description}</p>
      ) : null}
    </button>
  );
}
