import { findAllVmJenkins } from '@/repositories/vmJenkins/vmJenkinsRepository';
import { findVmIdsWithJenkinsToken } from '@/repositories/vmJenkins/vmJenkinsSecretRepository';
import type { Environment } from '@/types/common/project';

// Which environments can reach a Jenkins server through their VM.
//
// A VM runs **one** Jenkins, so the *server* (root, user, token) is a property
// of the VM (`vm_jenkins` / `vm_jenkins_secrets`, set from the tracker) while the
// *job* is a property of the environment. An environment on a VM with a complete
// server can browse that server's jobs before it has picked one.
//
// Until #84 an environment could also hold its own server credentials, and one
// with none could borrow a sibling's on the same VM. Both are gone: the VM is the
// only place a server is configured.
//
// Its own module rather than part of `jenkinsService` because `projectService`
// needs it, and `jenkinsService` already imports `projectService`, so putting it
// there would close an import cycle. It depends only on repositories.
//
// See docs/jenkins-sync.md § Where Jenkins is configured.

// Sets `jenkinsInherited` on every Jenkins environment whose VM has a complete
// server: a root, a user and a token. Only a complete one counts, or the UI would
// offer a browse that then fails.
//
// Two queries for the whole project, however many environments: every configured
// VM, then which of those hold a token.
export const annotateJenkinsInheritance = async (
  envs: Environment[]
): Promise<Environment[]> => {
  const onVm = envs.filter((env) => env.cicdProvider === 'jenkins' && env.vmId);
  if (onVm.length === 0) return envs;

  const wanted = new Set(onVm.map((env) => env.vmId as string));
  const servers = (await findAllVmJenkins()).filter(
    (row) => wanted.has(row.vm_id) && row.base_url.trim() && row.username.trim()
  );
  if (servers.length === 0) return envs;

  const withToken = new Set(await findVmIdsWithJenkinsToken(servers.map((row) => row.vm_id)));
  const ready = new Set(servers.filter((row) => withToken.has(row.vm_id)).map((row) => row.vm_id));

  return envs.map((env) =>
    env.cicdProvider === 'jenkins' && env.vmId && ready.has(env.vmId)
      ? { ...env, jenkinsInherited: true }
      : env
  );
};
