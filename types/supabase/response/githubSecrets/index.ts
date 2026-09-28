// Raw `github_secrets` row (snake_case). The table is a singleton reachable only
// through the service-role client — see githubSecretRepository.
export interface GithubSecretRow {
  id: boolean;
  access_token: string;
  account_login: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}
