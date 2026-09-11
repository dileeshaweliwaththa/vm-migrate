import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

// Repository layer: the MySQL client binaries.
//
// The **third** documented exception to "repositories only touch Supabase",
// after `jenkinsRepository` (HTTP) and `azureBlobRepository` — this one shells
// out. It is here rather than in the service for the same reason the others are:
// all the I/O in one place, no business rules, and one file to look at when a
// dump behaves oddly.
//
// `mysqldump` and `mysql` come from Alpine's `mysql-client` package, added to the
// runner stage of the Dockerfile. That is MariaDB's build of the client, which is
// what the previous worker container used against this same Azure MySQL server —
// so the flags below are deliberately the ones it proved, with no Oracle-only
// options (`--column-statistics` and friends make MariaDB's client exit 1).

export interface MysqlConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

// Never a database anyone wants a backup of, and `mysqldump` on the MySQL
// catalogue fails outright on a managed server.
const SYSTEM_DATABASES = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
]);

// Passwords go in the environment, not in argv: anything on the command line is
// visible in `ps` to every process in the container, and lands in an error
// message the moment the process fails.
const credentialEnv = (connection: MysqlConnection): NodeJS.ProcessEnv => ({
  ...process.env,
  MYSQL_PWD: connection.password,
});

const connectionArgs = (connection: MysqlConnection): string[] => [
  `--host=${connection.host}`,
  `--port=${String(connection.port)}`,
  `--user=${connection.user}`,
];

// A password can still reach stderr by way of a URL or a config echo, so every
// message leaving this file is scrubbed.
const sanitize = (message: string): string =>
  message.replace(/-p[^\s]+/g, '-p***').replace(/(password=)[^\s&]+/gi, '$1***');

export interface DatabaseListResult {
  ok: boolean;
  databases: string[];
  error?: string;
}

// The databases on the server, minus the system ones. `-N -B` gives one bare
// name per line, which is why this needs no parser.
export const listDatabases = async (
  connection: MysqlConnection
): Promise<DatabaseListResult> =>
  new Promise((resolve) => {
    const child = spawn(
      'mysql',
      [...connectionArgs(connection), '-N', '-B', '-e', 'SHOW DATABASES'],
      { env: credentialEnv(connection) }
    );

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
        databases: [],
        error: `Could not run the mysql client (${sanitize(error.message)}). Is mysql-client in the image?`,
      })
    );

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, databases: [], error: sanitize(err.trim()) || `mysql exited ${code}` });
        return;
      }
      resolve({
        ok: true,
        databases: out
          .split('\n')
          .map((line) => line.trim())
          .filter((name) => name && !SYSTEM_DATABASES.has(name.toLowerCase())),
      });
    });
  });

export interface DumpStream {
  // The dump itself, as it is produced. Never buffered: the caller pipes this
  // into gzip and on to Azure, so a 64MB database costs a few MB of memory
  // rather than 64 of them (which is what the old worker did, with a 500MB
  // `maxBuffer`).
  stream: Readable;
  // Resolves when `mysqldump` exits 0, rejects with its stderr otherwise. Await
  // it *after* the upload: a dump can fail halfway through a stream that has
  // already started flowing.
  completed: Promise<void>;
  // Kills the dump, for a run that is being abandoned.
  cancel: () => void;
}

// Starts a dump of one database.
//
// `--single-transaction` takes a consistent snapshot without locking the tables
// (InnoDB), and routines/triggers/events are included because a schema without
// them is not a restore. These are the flags the worker used against this
// server; changing them is changing what a backup contains.
export const openDumpStream = (
  connection: MysqlConnection,
  database: string
): DumpStream => {
  const child = spawn(
    'mysqldump',
    [
      ...connectionArgs(connection),
      '--single-transaction',
      '--routines',
      '--triggers',
      '--events',
      database,
    ],
    { env: credentialEnv(connection) }
  );

  let err = '';
  child.stderr.on('data', (chunk) => {
    err += String(chunk);
  });

  const completed = new Promise<void>((resolve, reject) => {
    child.on('error', (error) =>
      reject(
        new Error(
          `Could not run mysqldump (${sanitize(error.message)}). Is mysql-client in the image?`
        )
      )
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // mysqldump writes warnings to stderr on a successful run too, so the
      // exit code is what decides; stderr is only the explanation.
      reject(new Error(sanitize(err.trim()) || `mysqldump exited ${code}`));
    });
  });

  return {
    stream: child.stdout,
    completed,
    cancel: () => child.kill('SIGKILL'),
  };
};
