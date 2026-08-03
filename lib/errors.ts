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
