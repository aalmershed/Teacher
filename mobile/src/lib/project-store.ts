import type { Draft } from 'immer';
import { createDocStore, type SaveStatus } from './doc-store';
import { migrate, type Project, type ProjectData } from './project-types';

export type { SaveStatus };

// ملف الإنجاز المفتوح في المحرر — مشترك بين شاشة الصفحات وشاشة تعديل الصفحة
const store = createDocStore<ProjectData, { baseUrl: string }>({
  base: '/api/projects',
  itemKey: 'project',
  prepare: (p) => ({ ...p, data: migrate(p.data) }),
});

export const openProject = store.open;
export const closeProject = store.close;
export const flush = store.flush;
export const updateProject = (recipe: (draft: Draft<Project>) => void) => store.update(recipe);

export function useProjectState() {
  const { doc, status, error, rev } = store.useStore();
  return { project: doc as Project | null, status, error, rev };
}
