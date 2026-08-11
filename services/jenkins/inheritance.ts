import { findEnvironmentsByVmId } from '@/repositories/environments/environmentRepository';
import { findEnvironmentIdsWithToken } from '@/repositories/environmentSecrets/environmentSecretRepository';
import { rowToEnvironment } from '@/services/projects/mappers';
import type { Environment } from '@/types/common/project';

// Jenkins credential inheritance across a VM.
//
// A VM runs **one** Jenkins, so the *server* is a property of the VM while the
// *job* is a property of the environment. That asymmetry is the whole feature:
// the second environment placed on a VM is being pointed at a server that is
// already configured, so it should not have to be told the address, the user and
// the token again.
//
// This lives in its own module rather than in `jenkinsService` because
// `projectService` needs it too, and `jenkinsService` already imports
// `projectService` — putting it there would close an import cycle. It depends
// only on repositories and the row mappers.
//
// See docs/jenkins-sync.md § Inheriting a VM's Jenkins credentials.

// Whether an environment is a candidate to *lend* its Jenkins setup: Basic auth
// is username + token, and a URL to derive the server root from. The token is
// checked separately, in one batched query.
const canLend = (env: Environment): boolean =>
  Boolean(env.jenkinsUrl.trim()) && Boolean(env.jenkinsUsername.trim());

// Whether an environment *wants* to borrow: a Jenkins environment on a VM that
// has no server of its own configured.
const wantsToBorrow = (env: Environment): boolean =>
  env.cicdProvider === 'jenkins' && Boolean(env.vmId) && !env.jenkinsUrl.trim();

// The environment on this one's VM whose Jenkins credentials can be reused.
//
// Most recently updated first, so a rotated token is what gets lent, not the
// oldest one on the VM. Not scoped to a project on purpose: the VM is the unit
// that owns the server, and two projects can share one.
export const findVmJenkinsDonor = async (env: Environment): Promise<Environment | null> => {
  if (!env.vmId) return null;

  const candidates = (await findEnvironmentsByVmId(env.vmId))
    .map(rowToEnvironment)
    .filter((e) => e.id !== env.id && canLend(e));
  if (candidates.length === 0) return null;

  const withToken = new Set(await findEnvironmentIdsWithToken(candidates.map((e) => e.id)));
  return candidates.find((e) => withToken.has(e.id)) ?? null;
};

// Sets `jenkinsInherited` on any environment that has no Jenkins server of its
// own but sits on a VM that can lend one. It is what lets the UI offer "browse
// jobs" before this environment has been configured at all — listing jobs needs
// only the server and credentials, both of which the VM already has.
//
// Batched deliberately: one query per distinct **VM** plus one for the tokens,
// rather than `findVmJenkinsDonor` per environment, which is two queries each.
export const annotateJenkinsInheritance = async (
  envs: Environment[]
): Promise<Environment[]> => {
  const borrowers = envs.filter(wantsToBorrow);
  if (borrowers.length === 0) return envs;

  const vmIds = [...new Set(borrowers.map((e) => e.vmId as string))];
  const byVm = new Map<string, Environment[]>();
  await Promise.all(
    vmIds.map(async (vmId) => {
      byVm.set(vmId, (await findEnvironmentsByVmId(vmId)).map(rowToEnvironment));
    })
  );

  const candidates = [...byVm.values()].flat().filter(canLend);
  if (candidates.length === 0) return envs;

  const withToken = new Set(await findEnvironmentIdsWithToken(candidates.map((e) => e.id)));
  // Only a candidate that actually holds a token can lend one — a URL and a
  // username on their own would make the UI promise a browse that then fails.
  const lenders = new Set(candidates.filter((e) => withToken.has(e.id)).map((e) => e.id));

  const borrowing = new Set(borrowers.map((e) => e.id));
  return envs.map((env) => {
    if (!borrowing.has(env.id)) return env;
    const siblings = byVm.get(env.vmId as string) ?? [];
    const hasDonor = siblings.some((s) => s.id !== env.id && lenders.has(s.id));
    return hasDonor ? { ...env, jenkinsInherited: true } : env;
  });
};
