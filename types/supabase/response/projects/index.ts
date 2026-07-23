export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Present when selected with the `environments(count)` aggregate.
  environments?: { count: number }[];
  // Present when selected with `project_tags(tags(name))`.
  project_tags?: { tags: { name: string } | null }[];
}
