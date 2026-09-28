import { createServiceClient } from '@/lib/supabase/service';
import type { GithubSecretRow } from '@/types/supabase/response/githubSecrets';

// Repository layer: the app's GitHub access token in `github_secrets`.
//
// Same construction as `vmJenkinsSecretRepository`: the table has RLS enabled
// with NO policies, so no authenticated client can touch it. Only this
// repository — via the service-role client, from server code behind a role check
// in `githubService` — ever reads or writes it.
//
// A singleton: the one row has `id = true`.

export const findGithubSecret = async (): Promise<GithubSecretRow | null> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('github_secrets')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GithubSecretRow | null) ?? null;
};

export const upsertGithubSecret = async (values: {
  access_token: string;
  account_login: string;
  verified_at: string | null;
}): Promise<GithubSecretRow> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('github_secrets')
    .upsert({ id: true, ...values }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as GithubSecretRow;
};
