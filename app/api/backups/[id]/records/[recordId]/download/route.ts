import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { downloadBackup } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string; recordId: string }> };

// GET /api/backups/:id/records/:recordId/download — the dump file (editor+).
//
// Streamed straight out of Azure Blob Storage through this route rather than
// handed over as a blob URL or a SAS link: the connection string never leaves
// the server, the download inherits this app's session and role check, and a
// link cannot outlive either.
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

    const headers = new Headers();
    headers.set('Content-Type', result.contentType);
    // The blob's own name carries the database and the timestamp, which is what
    // the file should be called once it is on someone's disk.
    headers.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    if (result.size) headers.set('Content-Length', String(result.size));
    // A dump is not something a proxy or the browser should keep a copy of.
    headers.set('Cache-Control', 'no-store');

    // Node stream → web stream. Never buffered: these are 64MB files.
    return new NextResponse(Readable.toWeb(result.stream as Readable) as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download the backup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
