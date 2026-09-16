import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { POSTGRES_GLOBALS_DUMP } from '@/types/common/backup';

// Repository layer: the PostgreSQL client binaries.
//
// The sibling of `mysqlDumpRepository`, and a documented exception to
// "repositories only touch Supabase" for the same reason: it shells out. Same
// shape, same contract (`listDatabases`, `openDumpStream`), so the runner picks
// one of the two and nothing else in the feature knows which.
//
// `pg_dump`, `pg_dumpall` and `psql` come from Alpine's `postgresql17-client`,
// added to the runner stage of the Dockerfile. **The client's major version must
// be at least the server's** — pg_dump refuses to dump a server newer than
// itself ("server version: 17.x; pg_dump version: 16.x"), which is why the
// package is pinned to a major rather than left to whatever the base image
// happens to carry. Upgrading the target servers past 17 means bumping it.

export interface PostgresConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

// You cannot connect to Postgres without naming a database, so listing the
// others starts from the one every cluster has. The feature deliberately has no
// `db_name` column — the runner asks the server what it holds — and this is the
// one place that needs a name to ask *from*.
const MAINTENANCE_DATABASE = 'postgres';

// Passwords go in the environment, not in argv: anything on the command line is
// visible in `ps` to every process in the container, and lands in an error
// message the moment the process fails. `PGPASSWORD` is libpq's own channel for
// this, the exact counterpart of `MYSQL_PWD`.
//
// `PGSSLMODE=prefer` negotiates TLS and falls back, so the same target row works
// against a managed Supabase that requires it and a self-hosted one on a private
// address that does not. `PGCONNECT_TIMEOUT` so an unreachable host fails as a
// message in a few seconds rather than hanging the page's live check.
const credentialEnv = (connection: PostgresConnection): NodeJS.ProcessEnv => ({
  ...process.env,
  PGPASSWORD: connection.password,
  PGSSLMODE: process.env.PGSSLMODE ?? 'prefer',
  PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? '10',
});

const connectionArgs = (connection: PostgresConnection): string[] => [
  `--host=${connection.host}`,
  `--port=${String(connection.port)}`,
  `--username=${connection.user}`,
  // Never prompt. Without it a missing or rejected password makes the client sit
  // on a terminal read forever, and this one has no terminal.
  '--no-password',
];

// A password can still reach stderr by way of a connection URI in a message, so
// everything leaving this file is scrubbed the way the MySQL side is.
const sanitize = (message: string): string =>
  message
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1***@')
    .replace(/(password=)[^\s&'"]+/gi, '$1***');

// The one failure worth explaining rather than relaying.
//
// `pg_dump` takes an ACCESS SHARE lock on every table it is about to dump, so a
// role that cannot read one of them fails the *whole* dump with
// "permission denied for table …" and a LOCK statement listing a hundred tables.
// Nothing in that names the actual problem, which is the connecting role.
//
// It is the normal outcome against a **self-hosted Supabase**, whose `auth`,
// `storage`, `_analytics` and `_realtime` schemas are owned by `supabase_admin`:
// the `postgres` role there is not a superuser (`rolsuper = false`), so it can
// dump the app's own tables and nothing else. Supabase's own upgrade guide dumps
// with `-U supabase_admin` for this reason.
//
// Verified against a self-hosted Supabase 15.1: as `postgres`, "permission
// denied for table schema_migrations"; as `supabase_admin`, the same dump
// succeeds.
const explainFailure = (message: string): string =>
  /permission denied/i.test(message)
    ? `${message}\n\nThe connecting role cannot read every table, so pg_dump could not lock them all. A full dump needs a superuser: on a self-hosted Supabase that is supabase_admin, not postgres.`
    : message;

export interface DatabaseListResult {
  ok: boolean;
  databases: string[];
  error?: string;
}

const runClient = (
  binary: string,
  args: string[],
  connection: PostgresConnection
): Promise<{ ok: boolean; out: string; error?: string }> =>
  new Promise((resolve) => {
    const child = spawn(binary, args, { env: credentialEnv(connection) });

    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });

    child.on('error', (error) =>
      // The binary itself is missing — worth its own message, because the fix is
      // a rebuild rather than anything about the database.
      resolve({
        ok: false,
        out: '',
        error: `Could not run ${binary} (${sanitize(error.message)}). Is postgresql-client in the image?`,
      })
    );

    child.on('close', (code) =>
      resolve(
        code === 0
          ? { ok: true, out }
          : { ok: false, out, error: sanitize(err.trim()) || `${binary} exited ${code}` }
      )
    );
  });

// What this target will dump: the cluster's roles and grants, then every
// database on the server.
//
// `-A -t -q` is unaligned, tuple-only, quiet — one bare name per line, which is
// why this needs no parser. Templates and databases that refuse connections are
// excluded by the query rather than by a name list: `template0` cannot be
// connected to at all, and a `datallowconn = false` database would fail the dump
// rather than skip it.
export const listDatabases = async (
  connection: PostgresConnection
): Promise<DatabaseListResult> => {
  const result = await runClient(
    'psql',
    [
      ...connectionArgs(connection),
      `--dbname=${MAINTENANCE_DATABASE}`,
      '-A',
      '-t',
      '-q',
      '-c',
      'select datname from pg_database where not datistemplate and datallowconn order by datname',
    ],
    connection
  );

  if (!result.ok) return { ok: false, databases: [], error: result.error };

  const databases = result.out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Globals first, because that is the order a restore needs them in: the roles
  // have to exist before a dump that grants to them can be replayed.
  return { ok: true, databases: [POSTGRES_GLOBALS_DUMP, ...databases] };
};

export interface DumpStream {
  // The dump itself, as it is produced. Never buffered: the caller pipes this
  // into gzip and on to Azure, so a large database costs a few MB of memory
  // rather than its own size.
  stream: Readable;
  // Resolves when the client exits 0, rejects with its stderr otherwise. Await
  // it *after* the upload: a dump can fail halfway through a stream that has
  // already started flowing.
  completed: Promise<void>;
  // Kills the dump, for a run that is being abandoned.
  cancel: () => void;
}

// Starts a dump of one database — or of the cluster's globals.
//
// **Owners and grants are kept.** No `--no-owner` / `--no-acl` here, which the
// "move a database to Supabase" recipes use because they are restoring into a
// cluster whose roles differ. This is a backup of *this* cluster, and a
// self-hosted Supabase is held together by its grants: `anon`, `authenticated`
// and `service_role` are what PostgREST connects as, and every RLS policy is
// written against them. A dump stripped of that restores every table and then
// serves 401s.
//
// Plain SQL rather than `-Fc`, so a dump is the same `.sql.gz` a MySQL target
// produces — one restore story (`gunzip | psql`), one blob layout, and a file
// you can read without the tool that wrote it.
export const openDumpStream = (
  connection: PostgresConnection,
  database: string
): DumpStream => {
  const globals = database === POSTGRES_GLOBALS_DUMP;

  const child = globals
    ? spawn('pg_dumpall', [...connectionArgs(connection), '--globals-only'], {
        env: credentialEnv(connection),
      })
    : spawn(
        'pg_dump',
        // No snapshot flag, deliberately. `pg_dump` already takes a
        // repeatable-read snapshot for the whole dump, so it is consistent
        // without being asked — this is where mysqldump needs
        // `--single-transaction` and Postgres does not.
        // `--serializable-deferrable` would be stronger still, but it waits for
        // a snapshot with no anomalies and can sit there indefinitely on a busy
        // server, which is a hung nightly backup rather than a better one.
        [...connectionArgs(connection), `--dbname=${database}`],
        { env: credentialEnv(connection) }
      );

  const binary = globals ? 'pg_dumpall' : 'pg_dump';

  let err = '';
  child.stderr.on('data', (chunk) => {
    err += String(chunk);
  });

  const completed = new Promise<void>((resolve, reject) => {
    child.on('error', (error) =>
      reject(
        new Error(
          `Could not run ${binary} (${sanitize(error.message)}). Is postgresql-client in the image?`
        )
      )
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // Like mysqldump, these write notices to stderr on a good run too, so the
      // exit code decides and stderr is only the explanation.
      reject(new Error(explainFailure(sanitize(err.trim())) || `${binary} exited ${code}`));
    });
  });

  return {
    stream: child.stdout,
    completed,
    cancel: () => child.kill('SIGKILL'),
  };
};
