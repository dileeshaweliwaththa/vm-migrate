// Raw `endpoints` row as returned by Supabase (snake_case, DB column names).
//
// The single URL table behind both views — what used to be `vm_urls` (tracker)
// and `environment_ports` (projects). Exactly one parent is set, enforced by the
// `endpoints_one_parent` CHECK:
//
//   * `environment_id` — a project's record. The VM it appears on is *derived*
//     from `environments.vm_id`, never copied onto the row.
//   * `vm_id` — a VM-owned endpoint added from the tracker, with no project
//     behind it.
export interface EndpointRow {
  id: string;
  environment_id: string | null;
  vm_id: string | null;
  port: string;
  // The deployed branch, for managed-platform records that have no port.
  branch: string;
  protocol: string;
  // The record's label — surfaced as the projects table's "Name" column.
  description: string;
  // Where it answers. Was `vm_urls.url` on the tracker side.
  domain: string;
  source: string;
  jenkins_job_url: string;
  // The tracker's migration checklist.
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
  // Present when selected with the environment embed, which is how the tracker
  // resolves a project-owned row's VM and labels it with its project.
  environments?: {
    id: string;
    name: string;
    vm_id: string | null;
    project_id: string;
    projects?: { name: string; slug: string } | null;
  } | null;
}
