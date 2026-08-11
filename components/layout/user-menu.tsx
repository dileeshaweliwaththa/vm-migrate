'use client';

import { useRouter } from 'next/navigation';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/common';
import { NEVER_ACTIVE } from '@/components/layout/sidebar-item-styles';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';

// The account control. It lives in the **sidebar footer** and nowhere else —
// identity used to be rendered twice (plain text here, a clickable menu in the top
// bar), which meant two components to keep in step and two places showing the same
// name. This is the single one, and it is the interactive one: sign-out is here.
//
// Composed as shadcn's sidebar-footer pattern — `SidebarMenuButton` as the
// dropdown trigger — so it inherits the rail's collapsed behaviour for free
// instead of re-implementing it.
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
  const { isMobile } = useSidebar();

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
        <SidebarMenuButton
          size="lg"
          className={cn(
            // The sidebar tokens, not the global ones: `bg-accent` and
            // `text-muted-foreground` are tuned for a light surface and wash out
            // on the navy chrome. See docs/ui-guidelines.md § Two traps in the
            // sidebar.
            'h-auto gap-3 py-2 text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            // `data-[state=open]`, not `data-open:` — Radix 1.4.3 emits the
            // *valued* attribute, and the boolean variant would never match.
            'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
            // Never a nav destination; kills the primitive's phantom active fill.
            NEVER_ACTIVE
          )}
        >
          <Avatar className="size-9 shrink-0 rounded-full group-data-[collapsible=icon]:size-8">
            {/* The default fallback tone is tuned for a light surface. */}
            <AvatarFallback className="rounded-full bg-sidebar-primary text-xs font-bold uppercase text-sidebar-primary-foreground">
              {label.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {/* Collapsed to the icon rail, the avatar stands in for all of this —
              `SidebarMenuButton` hides overflow, and the chevron would crowd it. */}
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-body-sm font-medium">{label}</span>
            <span className="truncate font-mono text-[10px] capitalize text-sidebar-foreground/70">
              {role}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/70" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      {/* Opens away from the rail on desktop and upward on mobile, where the
          sidebar is a sheet and there is nothing to the right of it. */}
      <DropdownMenuContent
        side={isMobile ? 'top' : 'right'}
        align="end"
        sideOffset={8}
        className="w-60"
      >
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
