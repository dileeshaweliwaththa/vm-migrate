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
import { upsertTags, replaceProjectTags } from '@/repositories/tags/tagRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { isAdmin } from '@/lib/rbac';
import type { Project, ProjectDetail, ProjectInput } from '@/types/common/project';
import {
  collectProjectEnvironments,
  rowToProject,
  rowToEnvironment,
  slugify,
} from '@/services/projects/mappers';
import { annotateJenkinsInheritance } from '@/services/jenkins/inheritance';

// Service layer: business logic for projects. Maps rows to domain types and
// owns slug generation. Write-role enforcement is handled by RLS (see the projects
// migration) and role-aware UI; this layer stays lean like the VM tracker. The one
// read rule it owns is archived visibility — admins only, see listProjects.

const projectInputToColumns = (input: ProjectInput): ProjectWriteColumns => {
  const cols: ProjectWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name;
  if (input.slug !== undefined) cols.slug = input.slug;
  if (input.description !== undefined) cols.description = input.description;
  return cols;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /duplicate key|unique/i.test(error.message);

// Normalizes raw tag input (trim, drop empties, de-dupe case-insensitively).
const cleanTags = (tags?: string[]): string[] => {
  if (!tags) return [];
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const name = raw.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return Array.from(seen.values());
};

// Upserts the given tag names and links exactly them to the project.
const syncTags = async (projectId: string, tags: string[]): Promise<void> => {
  const rows = await upsertTags(tags);
  await replaceProjectTags(projectId, rows.map((t) => t.id));
};

// Archived projects are visible to **admins only**. The flag is re-checked here
// against the caller's real role rather than trusted from the query string, so a
// hand-crafted `?archived=true` reveals nothing to an editor or viewer. Ignored
// rather than rejected — it's a view filter, and silently returning the active
// list can't break a caller.
export const listProjects = async (includeArchived = false): Promise<Project[]> => {
  const showArchived = includeArchived && isAdmin(await getCurrentRole());
  const rows = await findAllProjects();
  const projects = rows.map(rowToProject);
  return showArchived ? projects : projects.filter((p) => !p.archived);
};

export const getProject = async (id: string): Promise<ProjectDetail | null> => {
  const row = await findProjectById(id);
  if (!row) return null;
  const envRows = await findProjectEnvironments(id);
  // `jenkinsInherited` needs the environments' VM siblings and their tokens, so it
  // is resolved here rather than in the row mapper. Batched across the whole
  // project — one query per distinct VM, not per environment — and it no-ops
  // entirely when nothing is waiting to borrow. Imported from
  // `services/jenkins/inheritance` rather than `jenkinsService`, which imports
  // *this* module and would close a cycle.
  const environments = await annotateJenkinsInheritance(envRows.map(rowToEnvironment));
  // The by-id select doesn't embed environments, so the row mapper's count and
  // summary list come back empty — fill both from the environments just read
  // rather than leaving a detail payload that contradicts its own `environments`
  // array.
  return {
    ...rowToProject(row),
    environmentCount: environments.length,
    environmentSummaries: collectProjectEnvironments(envRows),
    environments,
  };
};

export const createProject = async (input: ProjectInput): Promise<Project> => {
  const name = input.name?.trim() || 'Untitled project';
  const baseSlug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  const user = await getAuthenticatedUser();
  const tags = cleanTags(input.tags);

  const cols = projectInputToColumns({ ...input, name, slug: baseSlug });
  cols.created_by = user?.id ?? null;

  let row;
  try {
    row = await insertProject(cols);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Slug already taken — append a short suffix and try once more.
    cols.slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
    row = await insertProject(cols);
  }

  await syncTags(row.id, tags);
  return { ...rowToProject(row), tags };
};

export const updateProject = async (id: string, input: ProjectInput): Promise<Project> => {
  const row = await updateProjectRow(id, projectInputToColumns(input));
  if (input.tags !== undefined) {
    const tags = cleanTags(input.tags);
    await syncTags(id, tags);
    return { ...rowToProject(row), tags };
  }
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
