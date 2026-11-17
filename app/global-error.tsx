'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/errors/error-state';
import { fontVariables } from './fonts';
import './globals.css';

// The last resort: what renders when the **root layout itself** fails, which no
// `error.tsx` can catch. It replaces that layout, so it brings its own `<html>`,
// `<body>`, styles and fonts. There's no theme provider here, so it's always the
// light theme. Every other failure is caught lower down, inside the shell, by
// `(protected)/(app)/error.tsx`.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full items-center justify-center bg-background px-4 text-foreground">
        <title>Something went wrong · DevOps Portal</title>
        <ErrorState
          icon={TriangleAlert}
          title="The portal couldn't load."
          description="Something failed before any page could render. Trying again usually works. If it keeps happening, quote the reference below."
          reference={error.digest}
          actions={
            <Button size="sm" onClick={() => unstable_retry()}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          }
        />
      </body>
    </html>
  );
}
