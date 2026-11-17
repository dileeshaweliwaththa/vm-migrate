import type { BackupTargetRow } from '@/types/supabase/response/backupTargets';

// Which blobs in a shared container belong to which target.
//
// **One rule, three readers.** The history decides which dumps to list under a
// target, the download/delete path re-checks a client-supplied blob id, and
// retention decides what it may delete. They used to be two copies of the
// question: the history knew about the older flat layout, retention did not. So
// the history showed months of dumps under a target whose seven-day retention
// never looked at them, while the container grew by a night's dumps every night.
// A blob a target is shown is a blob that target's retention removes.
//
// Pure functions, no I/O: the callers fetch the rows (session-scoped for a page,
// service-role for a scheduled run, which has no session) and pass them in.

// Is this blob in the old flat `<database>/<file>` layout, which carries no
// target prefix? The one place the layout is recognised from a path.
export const isFlatLayoutBlob = (blobName: string): boolean =>
  blobName.split('/').length === 2;

// Does this target own the old flat `<database>/<file>` layout in its container?
//
// Only when exactly one target still carries that container in its legacy
// `azure_container` — with two candidates, showing those dumps under neither
// beats showing them under the wrong database server, and *deleting* them under
// the wrong server's retention would be worse still.
//
// Its own function because it answers two questions: whether a given blob is
// ours, and, before that, whether the whole container has to be listed to find
// our blobs at all.
export const claimsLegacyLayout = (
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  container: string
): boolean => {
  if (target.azure_container !== container) return false;
  const legacy = siblings.filter(
    (row) => row.azure_container === container && row.storage_id === target.storage_id
  );
  return legacy.length === 1 && legacy[0].id === target.id;
};

// Whether one blob belongs to this target.
//
// Two layouts coexist. This app writes `<target prefix>/<database>/<file>`, so
// those attribute exactly. The older flat `<database>/<file>` has nothing to
// attribute by, hence the claim rule above. A blob at the container root belongs
// to no database folder and so to no target.
export const blobBelongsToTarget = (
  blobName: string,
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  container: string
): boolean => {
  const segments = blobName.split('/');
  if (segments.length >= 3) {
    // Trimmed the way the runner trims it when it names a blob.
    const own = target.blob_prefix?.trim();
    return Boolean(own) && segments[0] === own;
  }
  if (isFlatLayoutBlob(blobName)) return claimsLegacyLayout(target, siblings, container);
  return false;
};

// What to pass `listBlobs` to see every blob this target owns, or `null` when it
// owns none it could find.
//
// `<prefix>/` narrows the listing to exactly this target's blobs, server-side.
// The flat layout carries no prefix to narrow by, so the target claiming it has
// to list the whole container and filter with `blobBelongsToTarget`.
export const ownedListingPrefix = (
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  container: string
): { prefix: string | undefined } | null => {
  if (claimsLegacyLayout(target, siblings, container)) return { prefix: undefined };
  const own = target.blob_prefix?.trim();
  return own ? { prefix: `${own}/` } : null;
};
