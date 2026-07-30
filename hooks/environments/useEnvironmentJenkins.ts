'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectDetailKey } from '@/hooks/projects/useProjects';
import { isTerminalRunPhase } from '@/types/common/jenkins';
import type {
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
  JenkinsJobSummary,
  JenkinsRunState,
  TriggerBuildResult,
} from '@/types/common/jenkins';

const base = (projectId: string, envId: string) =>
  `/api/projects/${projectId}/environments/${envId}`;

// Hook layer: per-environment Jenkins config (URL + username + hasToken). The
// token itself is never fetched — only whether one is set.

const configKey = (projectId: string, envId: string) => ['env-jenkins', projectId, envId];

const runKey = (projectId: string, envId: string, queueUrl: string) => [
  'env-jenkins-run',
  projectId,
  envId,
  queueUrl,
];

const jobsKey = (projectId: string, envId: string) => ['env-jenkins-jobs', projectId, envId];

// Polling cadence for a triggered run: fast while the queue pickup is the thing
// you're waiting on, then backing off, because a flat 2s across a 20-minute build
// is ~600 calls against Jenkins for no extra information.
//
// Stepped by poll count rather than wall-clock: the count comes from the query's
// own `dataUpdateCount`, so it resets with each new run for free and needs no
// mutable state of its own.
const RUN_POLL_STEPS = [
  { untilPolls: 15, everyMs: 2_000 }, // ~first 30s
  { untilPolls: 45, everyMs: 5_000 }, // ~next 2.5min
  { untilPolls: Infinity, everyMs: 10_000 }, // long builds
] as const;

// Hard ceiling — roughly 30 minutes under the schedule above. Past this the row
// keeps its last known state and the build number stays a link into Jenkins.
// Unbounded polling is how these leak.
const RUN_POLL_MAX_POLLS = 200;

// The job list refresh is much slower: it's a whole-server listing, and it only
// exists to catch builds this client didn't start.
const JOBS_LIVE_INTERVAL_MS = 15_000;

const runPollInterval = (polls: number): number =>
  RUN_POLL_STEPS.find((s) => polls < s.untilPolls)?.everyMs ??
  RUN_POLL_STEPS[RUN_POLL_STEPS.length - 1].everyMs;

export const useEnvironmentJenkinsConfig = (projectId: string, envId: string, enabled: boolean) =>
  useQuery({
    queryKey: configKey(projectId, envId),
    enabled,
    queryFn: async (): Promise<EnvironmentJenkinsConfig> => {
      const res = await fetch(`/api/projects/${projectId}/environments/${envId}/jenkins-config`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load Jenkins config.');
      return json.data as EnvironmentJenkinsConfig;
    },
  });

export const useSaveEnvironmentJenkinsConfig = (projectId: string, envId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EnvironmentJenkinsInput): Promise<EnvironmentJenkinsConfig> => {
      const res = await fetch(`/api/projects/${projectId}/environments/${envId}/jenkins-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save Jenkins config.');
      return json.data as EnvironmentJenkinsConfig;
    },
    onSuccess: (data) => {
      qc.setQueryData(configKey(projectId, envId), data);
      qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
    },
  });
};

// Lists all jobs on the environment's Jenkins server. Enabled only while the
// browse dialog is open, or while a card has jenkins-linked records.
//
// `live` turns on a slow refresh so a build started elsewhere (or by someone
// else) eventually shows up. One request per card covers every row — Jenkins'
// `color` carries an `_anime` suffix while a job is running — so this stays a
// single call regardless of how many records link jobs. Deliberately slower than
// the per-run poll below, which handles the build the user just triggered.
export const useJenkinsJobs = (
  projectId: string,
  envId: string,
  enabled: boolean,
  live = false
) =>
  useQuery({
    queryKey: jobsKey(projectId, envId),
    enabled,
    retry: false,
    refetchInterval: live ? JOBS_LIVE_INTERVAL_MS : false,
    queryFn: async (): Promise<JenkinsJobSummary[]> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-jobs`);
      // Read as text first so an unexpected non-JSON body (e.g. a proxy/error
      // page) surfaces a clean message instead of a raw JSON-parse error.
      const raw = await res.text();
      let json: { data?: JenkinsJobSummary[]; error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Unexpected server response (HTTP ${res.status}).`);
      }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load Jenkins jobs.');
      return (json.data ?? []) as JenkinsJobSummary[];
    },
  });

// Triggers a build of a job. Returns the server message plus the queue URL —
// the handle `useJenkinsRun` follows to report this run's progress.
export const useTriggerJenkinsBuild = (projectId: string, envId: string) =>
  useMutation({
    mutationFn: async (jobUrl: string): Promise<{ message: string; queueUrl: string }> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to trigger build.');
      const data = json.data as TriggerBuildResult | undefined;
      return { message: json.message ?? 'Build queued.', queueUrl: data?.queueUrl ?? '' };
    },
  });

// Follows one triggered run from queued through to its result.
//
// Polls a single endpoint; the service hides Jenkins' queue→build split. The poll
// stops on its own at a terminal phase and is bounded by RUN_POLL_MAX_MS, so
// there is no interval left running behind a finished or stuck build. Background
// tabs stay quiet — `refetchIntervalInBackground` is left at its default false.
export const useJenkinsRun = (projectId: string, envId: string, queueUrl: string | null) => {
  const qc = useQueryClient();
  const key = runKey(projectId, envId, queueUrl ?? '');

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(queueUrl),
    retry: false,
    queryFn: async (): Promise<JenkinsRunState> => {
      // Follow the build URL once one is known, because Jenkins drops queue items
      // a few minutes after they leave the queue while build URLs stay valid.
      // Read it back from the cache rather than a ref: the cache is keyed by this
      // run's queue URL, so a new run starts from the queue again automatically.
      const previous = qc.getQueryData<JenkinsRunState>(key);
      const param = previous?.buildUrl
        ? `build=${encodeURIComponent(previous.buildUrl)}`
        : `queue=${encodeURIComponent(queueUrl ?? '')}`;
      const res = await fetch(`${base(projectId, envId)}/jenkins-run?${param}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to read the build state.');
      return json.data as JenkinsRunState;
    },
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      if (phase && isTerminalRunPhase(phase)) return false;
      if (q.state.dataUpdateCount >= RUN_POLL_MAX_POLLS) return false;
      return runPollInterval(q.state.dataUpdateCount);
    },
  });

  // When the run finishes, refresh the job list and the project so the row's
  // Status and Last build columns catch up to the result.
  const phase = query.data?.phase;
  useEffect(() => {
    if (!phase || !isTerminalRunPhase(phase)) return;
    qc.invalidateQueries({ queryKey: jobsKey(projectId, envId) });
    qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
  }, [phase, projectId, envId, qc]);

  return query;
};

// Links a chosen job to this environment (sets URL + copies description).
export const useLinkJenkinsJob = (projectId: string, envId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { jobUrl: string; description: string }): Promise<string> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to link the job.');
      return json.message ?? 'Job linked.';
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
      qc.invalidateQueries({ queryKey: configKey(projectId, envId) });
    },
  });
};
