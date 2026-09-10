import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { downloadBackup } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string; recordId: string }> };

// GET /api/backups/:id/records/:recordId/download — the dump file (editor+).
//
// Proxied rather than linked directly at the worker: the worker sits on an
// internal address the browser may not reach, its API is unauthenticated, and a
// direct link would hand the file to anyone who guessed the URL. Going through
// here means the download inherits this app's session and role check.
//
// The body is **streamed**, never buffered: these are 64MB gzipped dumps.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id, recordId } = await context.params;
    const result = await downloadBackup(id, recordId);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    const upstream = result.response;
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/gzip');
    // Keep the worker's filename (it carries the database and the timestamp);
    // fall back to something honest rather than letting the browser name it
    // after the route.
    headers.set(
      'Content-Disposition',
      upstream.headers.get('content-disposition') ?? `attachment; filename="backup-${recordId}.sql.gz"`
    );
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    // A dump is not something a proxy or the browser should keep a copy of.
    headers.set('Cache-Control', 'no-store');

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download the backup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
