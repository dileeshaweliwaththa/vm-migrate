import { BlobServiceClient } from '@azure/storage-blob';
import type { Readable } from 'node:stream';

// Repository layer: Azure Blob Storage — where the dumps live.
//
// Another documented exception to "repositories only touch Supabase" (see
// `jenkinsRepository` and `mysqlDumpRepository`). It holds the SDK, the container
// handle and nothing else: what to name a blob, when to delete one, and who may
// ask are the service's decisions.
//
// The connection string is a credential and is passed in per call rather than
// read from the environment — it belongs to a *target* and lives in
// `backup_target_secrets`, so there is no module-level client to accidentally
// share between two targets' storage accounts.

// 4MB blocks, four at a time: the upload is the slow half of a backup, and this
// is the SDK's own recommended shape for a stream of unknown length. Larger
// blocks mean more memory held per concurrent upload for no throughput gain at
// these sizes.
const UPLOAD_BLOCK_BYTES = 4 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

const containerClient = (connectionString: string, container: string) =>
  BlobServiceClient.fromConnectionString(connectionString).getContainerClient(container);

export interface BlobSummary {
  name: string;
  size: number;
  // ISO, from the blob's own metadata — the authority on when a dump was taken,
  // since the file itself carries no other date.
  createdAt: string;
}

// Uploads a stream as one blob. The stream is consumed as it arrives, so the
// dump is never held in memory or written to disk.
export const uploadBlobStream = async (
  connectionString: string,
  container: string,
  blobName: string,
  stream: Readable
): Promise<{ url: string }> => {
  const client = containerClient(connectionString, container);
  // Idempotent, and cheaper than making the caller guarantee the container
  // exists — a new target's first backup would otherwise fail on setup rather
  // than on anything about the backup.
  await client.createIfNotExists();

  const blob = client.getBlockBlobClient(blobName);
  await blob.uploadStream(stream, UPLOAD_BLOCK_BYTES, UPLOAD_CONCURRENCY, {
    blobHTTPHeaders: {
      // Gzipped SQL. Not `Content-Encoding: gzip` — that would make clients
      // silently decompress it, and what we want is the file as it is.
      blobContentType: 'application/gzip',
    },
  });

  return { url: blob.url };
};

export const listBlobs = async (
  connectionString: string,
  container: string,
  prefix?: string
): Promise<BlobSummary[]> => {
  const client = containerClient(connectionString, container);
  if (!(await client.exists())) return [];

  const blobs: BlobSummary[] = [];
  for await (const blob of client.listBlobsFlat({ prefix })) {
    blobs.push({
      name: blob.name,
      size: blob.properties.contentLength ?? 0,
      createdAt: (blob.properties.createdOn ?? blob.properties.lastModified)?.toISOString() ?? '',
    });
  }
  // Newest first: every consumer wants the recent end of it.
  return blobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const deleteBlob = async (
  connectionString: string,
  container: string,
  blobName: string
): Promise<void> => {
  const client = containerClient(connectionString, container);
  await client.getBlockBlobClient(blobName).deleteIfExists();
};

export interface BlobDownload {
  stream: NodeJS.ReadableStream;
  size: number;
  contentType: string;
}

// Opens a blob for reading. Returns the stream rather than the bytes: a route
// pipes it to the browser, and these are 64MB files.
export const downloadBlob = async (
  connectionString: string,
  container: string,
  blobName: string
): Promise<BlobDownload | null> => {
  const blob = containerClient(connectionString, container).getBlockBlobClient(blobName);
  if (!(await blob.exists())) return null;

  const response = await blob.download();
  if (!response.readableStreamBody) return null;

  return {
    stream: response.readableStreamBody,
    size: response.contentLength ?? 0,
    contentType: response.contentType ?? 'application/gzip',
  };
};
