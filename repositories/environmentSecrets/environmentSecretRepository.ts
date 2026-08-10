import { createServiceClient } from '@/lib/supabase/service';

// Repository layer: the per-environment Jenkins API token in `environment_secrets`.
//
// This table has RLS enabled with NO policies, so no authenticated client can
// touch it. Only this repository — via the service-role client, from server code
// behind a role check in the service layer (editor+ to configure, any signed-in
// role to run a build) — ever reads or writes it. The token is never returned to
// the browser, so a viewer can trigger a build without seeing the credentials.

export const getEnvironmentToken = async (environmentId: string): Promise<string> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('environment_secrets')
    .select('jenkins_api_token')
    .eq('environment_id', environmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.jenkins_api_token as string | undefined) ?? '';
};

export const hasEnvironmentToken = async (environmentId: string): Promise<boolean> => {
  const token = await getEnvironmentToken(environmentId);
  return token.trim().length > 0;
};

// Which of these environments hold a non-empty token. Returns **ids only** — it
// is the one query here whose result is allowed to inform a decision made outside
// this file, so it deliberately cannot carry a token value with it.
export const findEnvironmentIdsWithToken = async (
  environmentIds: string[]
): Promise<string[]> => {
  if (environmentIds.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('environment_secrets')
    .select('environment_id, jenkins_api_token')
    .in('environment_id', environmentIds);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => ((row.jenkins_api_token as string | null) ?? '').trim().length > 0)
    .map((row) => row.environment_id as string);
};

export const setEnvironmentToken = async (
  environmentId: string,
  token: string
): Promise<void> => {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('environment_secrets')
    .upsert(
      { environment_id: environmentId, jenkins_api_token: token },
      { onConflict: 'environment_id' }
    );
  if (error) throw new Error(error.message);
};
