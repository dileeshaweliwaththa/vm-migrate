-- An optional display name for an environment.
--
-- `environments.name` is the **stage** — one of the three values in the
-- `environment_name` enum, and what the project page's switcher groups by. It
-- was never an identity: a project can run two DEVs on the same machine (CSE's
-- UAT box and its integration box both sit on EUKHOST-STRATEGIZER), and every
-- place that shows an environment — the cards, the project list's hover, the
-- tracker's record badges — rendered them as two identical `DEV` rows with
-- nothing to tell them apart.
--
-- Splitting the two rather than loosening the enum: the stage stays fixed, so
-- the switcher, the lifecycle ordering and the dashboard's breakdown keep
-- working on a closed set, and the *name* is a second, free-text column. Blank
-- is the normal case — one environment per stage needs no disambiguation — and
-- the one that does reads as `DEV · CSE UAT`.
alter table public.environments
  add column if not exists label text not null default '';
