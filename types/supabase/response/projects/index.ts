import type { VmSummaryRow } from '@/types/supabase/response/vms';

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
  // Present when selected with `environments(id, name, vm_id, vms(...))`.
  // One entry per environment, so the list is both the count *and* the card's
  // hover breakdown — the card names each environment and its VM, and a separate
  // `environments(count)` aggregate alongside a second embed of the same relation
  // buys nothing.
  environments?: {
    id: string;
    name: string;
    vm_id: string | null;
    vms: VmSummaryRow | null;
  }[];
  // Present when selected with `project_tags(tags(name))`.
  project_tags?: { tags: { name: string } | null }[];
}
