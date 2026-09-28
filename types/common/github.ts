// Domain types for the GitHub connection (docs/github.md).
//
// Secret-free by construction, like the other integrations: the token is set in
// Settings and never returned — the browser is only told whether one is
// configured and which account it belongs to.

export interface GithubStatus {
  configured: boolean;
  // The GitHub user the token authenticates as, captured when it was verified.
  login: string;
  verifiedAt: string | null;
}

// Result of re-verifying the stored token from Settings.
export interface GithubTestResult {
  login: string;
  // How many repositories the token can see — the quickest way to tell a token
  // that was scoped to the wrong owner from one that works.
  repoCount: number;
}

export interface GithubRepo {
  // `owner/name` — the identity the branch listing is keyed on.
  fullName: string;
  // The repository's web page; what a record stores as its `repoUrl`.
  url: string;
  private: boolean;
  defaultBranch: string;
}

// The picker's list. `configured: false` is a normal answer, not an error: with no
// token the popover falls back to typing the repository by hand.
export interface GithubRepoList {
  configured: boolean;
  repos: GithubRepo[];
}

export interface GithubBranchList {
  configured: boolean;
  branches: string[];
}
