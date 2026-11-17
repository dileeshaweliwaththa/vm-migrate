import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/errors/error-state';

// The 404 for a URL that matches no route at all. It renders inside the root
// layout only (no sidebar), because an unknown URL hasn't been through the
// signed-in guard. `/` sends a signed-in user to the dashboard and anyone else
// to the login page.
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <ErrorState
        icon={SearchX}
        title="Page not found"
        description="There's no page at this address."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/">Go to the start page</Link>
          </Button>
        }
      />
    </main>
  );
}
