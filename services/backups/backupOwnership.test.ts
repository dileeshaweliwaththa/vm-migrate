import { describe, expect, it } from 'vitest';
import {
  blobBelongsToTarget,
  claimsLegacyLayout,
  isFlatLayoutBlob,
  ownedListingPrefix,
} from '@/services/backups/backupOwnership';
import type { BackupTargetRow } from '@/types/supabase/response/backupTargets';

// These rules decide what the nightly retention pass **deletes**, so each case
// below is a dump that must, or must never, be removed.

const CONTAINER = 'mysql-backups';
const STORAGE = 'storage-1';

const target = (overrides: Partial<BackupTargetRow>): BackupTargetRow => ({
  id: 'target',
  name: 'Target',
  engine: 'mysql',
  worker_url: '',
  db_host: 'db.example.com',
  db_port: 3306,
  db_user: 'backup',
  azure_account: '',
  azure_container: '',
  storage_id: STORAGE,
  blob_prefix: '',
  retention_days: 7,
  cron_schedule: '0 2 * * *',
  schedule_enabled: true,
  notes: '',
  position: 0,
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
  ...overrides,
});

// The production shape: one MySQL target that inherited the old worker's
// container, and a Postgres target with only its own prefix.
const mysql = target({ id: 'mysql', blob_prefix: 'azure-backup', azure_container: CONTAINER });
const postgres = target({ id: 'postgres', blob_prefix: 'kumkum' });
const siblings = [mysql, postgres];

describe('isFlatLayoutBlob', () => {
  it('recognises <database>/<file> only', () => {
    expect(isFlatLayoutBlob('sttk-prod/sttk-prod_2026-11-17T02-00-02.sql.gz')).toBe(true);
    expect(isFlatLayoutBlob('azure-backup/sttk-prod/sttk-prod_x.sql.gz')).toBe(false);
    expect(isFlatLayoutBlob('backup_2026-03-24T18-10-49.sql.gz')).toBe(false);
  });
});

describe('claimsLegacyLayout', () => {
  it('belongs to the one target still carrying the container', () => {
    expect(claimsLegacyLayout(mysql, siblings, CONTAINER)).toBe(true);
    expect(claimsLegacyLayout(postgres, siblings, CONTAINER)).toBe(false);
  });

  it('belongs to nobody when two targets carry the container', () => {
    const twin = target({ id: 'twin', blob_prefix: 'twin', azure_container: CONTAINER });
    expect(claimsLegacyLayout(mysql, [...siblings, twin], CONTAINER)).toBe(false);
    expect(claimsLegacyLayout(twin, [...siblings, twin], CONTAINER)).toBe(false);
  });

  it('does not count a target on another storage account', () => {
    const elsewhere = target({ id: 'elsewhere', azure_container: CONTAINER, storage_id: 'storage-2' });
    expect(claimsLegacyLayout(mysql, [...siblings, elsewhere], CONTAINER)).toBe(true);
  });
});

describe('blobBelongsToTarget', () => {
  it('matches a target by its own prefix', () => {
    expect(blobBelongsToTarget('azure-backup/db/db_x.sql.gz', mysql, siblings, CONTAINER)).toBe(true);
    expect(blobBelongsToTarget('kumkum/db/db_x.sql.gz', mysql, siblings, CONTAINER)).toBe(false);
    expect(blobBelongsToTarget('kumkum/db/db_x.sql.gz', postgres, siblings, CONTAINER)).toBe(true);
  });

  it('gives the flat layout to the target that claims it', () => {
    const flat = 'tourcan-prod/tourcan-prod_2026-11-17T02-00-02.sql.gz';
    expect(blobBelongsToTarget(flat, mysql, siblings, CONTAINER)).toBe(true);
    expect(blobBelongsToTarget(flat, postgres, siblings, CONTAINER)).toBe(false);
  });

  it('never gives away a blob at the container root', () => {
    const root = 'backup_2026-03-24T18-10-49.sql.gz';
    expect(blobBelongsToTarget(root, mysql, siblings, CONTAINER)).toBe(false);
    expect(blobBelongsToTarget(root, postgres, siblings, CONTAINER)).toBe(false);
  });

  // The regression: retention used to delete every old blob in the container
  // for a target with no prefix of its own.
  it('gives a target with no prefix nothing it cannot attribute', () => {
    const bare = target({ id: 'bare', blob_prefix: '' });
    const all = [...siblings, bare];
    expect(blobBelongsToTarget('azure-backup/db/db_x.sql.gz', bare, all, CONTAINER)).toBe(false);
    expect(blobBelongsToTarget('kumkum/db/db_x.sql.gz', bare, all, CONTAINER)).toBe(false);
    expect(blobBelongsToTarget('db/db_x.sql.gz', bare, all, CONTAINER)).toBe(false);
  });

  it('matches a prefix the way the runner trims it', () => {
    const padded = target({ id: 'padded', blob_prefix: ' padded ' });
    expect(blobBelongsToTarget('padded/db/db_x.sql.gz', padded, [padded], CONTAINER)).toBe(true);
  });
});

describe('ownedListingPrefix', () => {
  it('lists the whole container for the target claiming the flat layout', () => {
    expect(ownedListingPrefix(mysql, siblings, CONTAINER)).toEqual({ prefix: undefined });
  });

  it('narrows to the prefix otherwise', () => {
    expect(ownedListingPrefix(postgres, siblings, CONTAINER)).toEqual({ prefix: 'kumkum/' });
  });

  it('lists nothing for a target that owns nothing it could find', () => {
    const bare = target({ id: 'bare', blob_prefix: '' });
    expect(ownedListingPrefix(bare, [...siblings, bare], CONTAINER)).toBeNull();
  });
});
