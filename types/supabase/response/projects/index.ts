export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  client: string;
  description: string;
  repo_url: string;
  cicd_provider: string;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Present when selected with the `environments(count)` aggregate.
  environments?: { count: number }[];
}
