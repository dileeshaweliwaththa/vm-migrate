'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/common';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The account control, in the top bar. This is the *clickable* identity — the
// sidebar shows the same name and role as plain text and does nothing on click.
//
// Sign-out runs on the browser client so the session cookies are cleared where
// they live, then `router.refresh()` re-runs the server layout, whose guard
// redirects to /login.
const roleBadgeVariant: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  editor: 'secondary',
  viewer: 'outline',
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: UserRole;
}) {
  const router = useRouter();

  // `profiles.name` is optional, so fall back to the address rather than
  // rendering an empty row.
  const label = name.trim() || email;

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* `h-auto` overrides the variant's fixed height so two lines fit. */}
        <Button variant="ghost" className="h-auto gap-2 px-2 py-1.5">
          <Avatar className="size-8 rounded-full">
            <AvatarFallback className="rounded-full bg-muted text-xs font-semibold uppercase">
              {label.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {/* Hidden on the narrowest screens — the avatar alone still opens it. */}
          <span className="hidden text-left leading-tight sm:grid">
            <span className="truncate text-sm font-medium">{label}</span>
            <span className="truncate text-xs font-normal capitalize text-muted-foreground">
              {role}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        {/* The address goes here rather than in the trigger: the trigger shows who
            you are, the menu confirms which account that is. */}
        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
          <span className="truncate">{email}</span>
          <Badge variant={roleBadgeVariant[role]} className="shrink-0 capitalize">
            {role}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 size-4" aria-hidden /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
