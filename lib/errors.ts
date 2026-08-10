// Shared error types that cross the service → routing boundary.
//
// Most services return an `ApiResponse` and carry a denial in `message`. The VM
// tracker's service returns bare domain types instead (`Vm`, `VmUrl`, `void`),
// so it signals a denied action by throwing. `ForbiddenError` is what lets a
// route answer 403 rather than folding an authorization failure into a generic
// 500.

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// Checked by `name`, not `instanceof`: a Next.js route handler and the service it
// calls can be evaluated in different module instances, which makes prototype
// identity unreliable across that boundary.
export const isForbidden = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ForbiddenError';

// The convention services follow for a denial they *return* rather than throw:
// a message ending in "access required." (see docs/auth.md). Routes use it to
// answer 403 instead of folding an authorization failure into a 400 — an audit of
// access-control behaviour reads response codes, not message text.
export const isDeniedMessage = (message: string | undefined): boolean =>
  Boolean(message?.trim().endsWith('access required.'));

// Status for a write that returns an ApiResponse: `ok` when it succeeded, 403 for
// an authorization denial, 400 for anything else (a validation failure).
export const writeStatus = (
  response: { success: boolean; message?: string },
  ok = 200
): number => (response.success ? ok : isDeniedMessage(response.message) ? 403 : 400);
