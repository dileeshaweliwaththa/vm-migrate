import { createServiceClient } from '@/lib/supabase/service';

// Repository layer: a backup target's credentials in `backup_target_secrets` —
// the MySQL password and the Azure Storage connection string.
//
// Same construction as `environment_secrets` and `vm_jenkins_secrets`: the table
// has RLS enabled with NO policies, so no authenticated client can touch it.
// Only this repository — via the service-role client, from server code behind a
// role check in the service layer — ever reads or writes it. Neither value is
// ever returned to a browser; the UI is told whether one is stored, not what it
// is.

export interface BackupTargetSecrets {
  dbPassword: string;
  azureConnectionString: string;
}

export const getBackupTargetSecrets = async (targetId: string): Promise<BackupTargetSecrets> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('backup_target_secrets')
    .select('db_password, azure_connection_string')
    .eq('target_id', targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    dbPassword: (data?.db_password as string | undefined) ?? '',
    azureConnectionString: (data?.azure_connection_string as string | undefined) ?? '',
  };
};

// Which of these targets hold which secrets. Returns **flags only** — it is the
// one query here whose result informs a decision made outside this file, so it
// deliberately cannot carry a credential with it.
export const findBackupTargetSecretFlags = async (
  targetIds: string[]
): Promise<Map<string, { hasDbPassword: boolean; hasAzureConnection: boolean }>> => {
  const flags = new Map<string, { hasDbPassword: boolean; hasAzureConnection: boolean }>();
  if (targetIds.length === 0) return flags;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('backup_target_secrets')
    .select('target_id, db_password, azure_connection_string')
    .in('target_id', targetIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    flags.set(row.target_id as string, {
      hasDbPassword: ((row.db_password as string | null) ?? '').trim().length > 0,
      hasAzureConnection:
        ((row.azure_connection_string as string | null) ?? '').trim().length > 0,
    });
  }
  return flags;
};

// Writes only the values given. An absent field leaves the stored one alone,
// which is what lets the form mean "keep the current password" by sending
// nothing — it was never given the current one to resend.
export const setBackupTargetSecrets = async (
  targetId: string,
  values: Partial<BackupTargetSecrets>
): Promise<void> => {
  if (values.dbPassword === undefined && values.azureConnectionString === undefined) return;

  const supabase = createServiceClient();
  const patch: Record<string, string> = { target_id: targetId };
  if (values.dbPassword !== undefined) patch.db_password = values.dbPassword;
  if (values.azureConnectionString !== undefined) {
    patch.azure_connection_string = values.azureConnectionString;
  }

  const { error } = await supabase
    .from('backup_target_secrets')
    .upsert(patch, { onConflict: 'target_id' });
  if (error) throw new Error(error.message);
};
