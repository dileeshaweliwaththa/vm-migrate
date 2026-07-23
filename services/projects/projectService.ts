import {
  findAllProjects,
  findProjectById,
  findProjectEnvironments,
  insertProject,
  updateProject as updateProjectRow,
  deleteProject as deleteProjectRow,
  type ProjectWriteColumns,
} from '@/repositories/projects/projectRepository';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import type { Project, ProjectDetail, ProjectInput } from '@/types/common/project';
import { rowToProject, rowToEnvironment, slugify } from '@/services/projects/mappers';

// Service layer: business logic for projects. Maps rows to domain types and
// owns slug generation. Role enforcement is handled by RLS (see the projects
// migration) and role-aware UI; this layer stays lean like the VM tracker.

const projectInputToColumns = (input: ProjectInput): ProjectWriteColumns => {
  const cols: ProjectWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name;
  if (input.slug !== undefined) cols.slug = input.slug;
  if (input.client !== undefined) cols.client = input.client;
  if (input.description !== undefined) cols.description = input.description;
  if (input.repoUrl !== undefined) cols.repo_url = input.repoUrl;
  if (input.cicdProvider !== undefined) cols.cicd_provider = input.cicdProvider;
  return cols;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /duplicate key|unique/i.test(error.message);

export const listProjects = async (includeArchived = false): Promise<Project[]> => {
  const rows = await findAllProjects();
  const projects = rows.map(rowToProject);
  return includeArchived ? projects : projects.filter((p) => !p.archived);
};

export const getProject = async (id: string): Promise<ProjectDetail | null> => {
  const row = await findProjectById(id);
  if (!row) return null;
  const envRows = await findProjectEnvironments(id);
  return { ...rowToProject(row), environments: envRows.map(rowToEnvironment) };
};

export const createProject = async (input: ProjectInput): Promise<Project> => {
  const name = input.name?.trim() || 'Untitled project';
  const baseSlug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  const user = await getAuthenticatedUser();

  const cols = projectInputToColumns({ ...input, name, slug: baseSlug });
  cols.created_by = user?.id ?? null;

  try {
    const row = await insertProject(cols);
    return rowToProject(row);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Slug already taken — append a short suffix and try once more.
    cols.slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
    const row = await insertProject(cols);
    return rowToProject(row);
  }
};

export const updateProject = async (id: string, input: ProjectInput): Promise<Project> => {
  const row = await updateProjectRow(id, projectInputToColumns(input));
  return rowToProject(row);
};

export const setProjectArchived = async (id: string, archived: boolean): Promise<Project> => {
  const row = await updateProjectRow(id, {
    archived,
    archived_at: archived ? new Date().toISOString() : null,
  });
  return rowToProject(row);
};

export const removeProject = async (id: string): Promise<void> => {
  await deleteProjectRow(id);
};
