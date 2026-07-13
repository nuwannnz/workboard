import { describe, it, expect } from 'vitest';
import {
  projectSchema,
  projectColorSchema,
  createProjectSchema,
  updateProjectSchema,
  PROJECT_COLORS,
} from './project';

describe('projectSchema', () => {
  it('parses a valid project and applies the color default', () => {
    const parsed = projectSchema.parse({
      id: 'p1',
      name: 'Launch',
      order: 'V',
      createdAt: '2026-07-08T09:00:00.000Z',
      updatedAt: '2026-07-08T09:00:00.000Z',
    });
    expect(parsed.name).toBe('Launch');
    expect(parsed.color).toBe('slate');
  });

  it('rejects an empty name', () => {
    expect(
      projectSchema.safeParse({
        id: 'p1',
        name: '',
        order: 'V',
        createdAt: '2026-07-08T09:00:00.000Z',
        updatedAt: '2026-07-08T09:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('projectColorSchema (PROJECT_COLORS palette)', () => {
  it('accepts every palette token', () => {
    for (const color of PROJECT_COLORS) {
      expect(projectColorSchema.parse(color)).toBe(color);
    }
  });

  it('rejects a non-palette color', () => {
    expect(projectColorSchema.safeParse('turquoise').success).toBe(false);
    expect(projectColorSchema.safeParse('#ff0000').success).toBe(false);
  });
});

describe('createProjectSchema (POST /projects body)', () => {
  it('requires a non-empty, trimmed name (FR-002)', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
    const parsed = createProjectSchema.parse({ name: '  Launch  ' });
    expect(parsed.name).toBe('Launch');
  });

  it('defaults color to slate when omitted', () => {
    const parsed = createProjectSchema.parse({ name: 'Launch' });
    expect(parsed.color).toBe('slate');
  });

  it('accepts an optional description and a palette color', () => {
    const parsed = createProjectSchema.parse({
      name: 'Launch',
      description: 'Q3 launch work',
      color: 'blue',
    });
    expect(parsed.description).toBe('Q3 launch work');
    expect(parsed.color).toBe('blue');
  });

  it('rejects a non-palette color', () => {
    expect(createProjectSchema.safeParse({ name: 'Launch', color: 'gold' }).success).toBe(false);
  });
});

describe('updateProjectSchema (PATCH /projects/:id body)', () => {
  it('accepts a partial body (any single field or empty)', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(true);
    expect(updateProjectSchema.safeParse({ color: 'red' }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ order: 'Vm' }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ description: 'notes' }).success).toBe(true);
  });

  it('rejects an empty name when the field is present (Story 5.5)', () => {
    expect(updateProjectSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });
});
