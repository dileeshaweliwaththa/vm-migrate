import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
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

// Ten seconds to get connected, then give up.
//
// Without a bound the client waits forever, because MySQL's handshake has the
// *server* speak first: pointed at a port that is listening but is not MySQL —
// a Postgres one, say — the client blocks reading an initial packet that never
// arrives while the other end blocks waiting for a request. Nothing times out,
// and the HTTP request that triggered it hangs until a proxy kills it, which
// reaches the browser as a bodiless gateway error rather than as a message.
//
// It bounds the connection phase only; a dump itself may take as long as it
// takes.
const CONNECT_TIMEOUT_SECONDS = 10;

// **Only the two flags both binaries understand.** `--connect-timeout` is *not*
// one of them: it is an option of the `mysql` client, and MariaDB's
// `mariadb-dump` — which is what `mysqldump` is in this image — rejects it
// outright with `unknown variable 'connect-timeout=10'` before it connects to
// anything. Passing it to both is what broke every dump on this server for a
// night: listing the databases still worked, so the target read *Ready* and the
// batch still enumerated 19 databases, and then all 19 died in 200ms each.
//
// So the timeout goes on the client that has it (below), and the dump gets the
// equivalent bound from the no-first-byte timer in `openDumpStream` instead.
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
      [
        ...connectionArgs(connection),
        `--connect-timeout=${String(CONNECT_TIMEOUT_SECONDS)}`,
        '-N',
        '-B',
        '-e',
        'SHOW DATABASES',
      ],
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

  // The dump's own bound on the connection phase, standing in for the
  // `--connect-timeout` this binary will not accept: a dump that has produced
  // no output at all by now is still waiting on a handshake that is not coming,
  // so it is killed rather than left to hang the request behind it. Once the
  // first byte arrives the dump may take as long as it takes.
  //
  // The bytes are counted through a relay rather than by listening on the
  // child's stdout, because a `data` listener there would put that stream into
  // flowing mode before the caller attaches its own pipe and the opening chunks
  // of the dump would be dropped. A Transform sees every chunk on its way past
  // and preserves backpressure.
  let timedOut = false;
  const connectTimer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, CONNECT_TIMEOUT_SECONDS * 1000);

  const relay = new Transform({
    transform(chunk, _encoding, done) {
      clearTimeout(connectTimer);
      done(null, chunk);
    },
  });
  child.stdout.pipe(relay);

  const completed = new Promise<void>((resolve, reject) => {
    child.on('error', (error) => {
      clearTimeout(connectTimer);
      reject(
        new Error(
          `Could not run mysqldump (${sanitize(error.message)}). Is mysql-client in the image?`
        )
      );
    });
    child.on('close', (code) => {
      clearTimeout(connectTimer);
      if (timedOut) {
        reject(
          new Error(
            `mysqldump produced nothing within ${String(CONNECT_TIMEOUT_SECONDS)}s — ` +
              `is ${connection.host}:${String(connection.port)} a MySQL server?`
          )
        );
        return;
      }
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
    stream: relay,
    completed,
    cancel: () => {
      clearTimeout(connectTimer);
      child.kill('SIGKILL');
    },
  };
};
