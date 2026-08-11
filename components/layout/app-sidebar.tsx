'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Layers,
  SlidersHorizontal,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/rbac';
import type { UserRole } from '@/types/common';
import { NEVER_ACTIVE } from '@/components/layout/sidebar-item-styles';
import { UserMenu } from '@/components/layout/user-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

// Two groups, because the design separates them: the working set at the top, and
// configuration pinned to the bottom above the identity block.
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/projects', label: 'Projects', icon: Layers },
  { href: '/tracker', label: 'VM Tracker', icon: Terminal },
  { href: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
];

const UTILITY_NAV: NavItem[] = [
  { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontal, adminOnly: true },
];

// Shared by both groups so the pinned Settings item can't drift from the rest.
//
// `NEVER_ACTIVE` first to kill the primitive's phantom active fill (see that
// module for why every button gets it), then the real active styling from React
// state. `!` on the active rules because both land at equal specificity and
// emission order shouldn't pick the winner.
const navItemClass = (active: boolean) =>
  cn(
    'h-10 gap-4 rounded-sm text-body-md transition-all duration-200 [&>svg]:size-5',
    NEVER_ACTIVE,
    active
      ? // The accent, plus the design's two touches: a glow keyed to the same
        // accent, and a 4px nudge inward. The nudge is dropped on the icon rail,
        // where there is no room for it and it would just clip the icon.
        //
        // `font-semibold!` needs the `!` as much as the colours do, and for a
        // second reason: `NEVER_ACTIVE`'s `data-active:font-normal` compiles to
        // `.data-active\:font-normal[data-active]` — specificity (0,2,0) — which
        // outranks a plain `.font-semibold` (0,1,0). tailwind-merge keeps both
        // (different variants), so without the `!` the current nav item silently
        // renders at the same weight as its inactive siblings.
        'bg-sidebar-primary! font-semibold! text-sidebar-primary-foreground! shadow-nav-active hover:bg-sidebar-primary! hover:text-sidebar-primary-foreground! translate-x-1 group-data-[collapsible=icon]:translate-x-0'
      : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
  );

export function AppSidebar({
  role,
  name,
  email,
}: {
  role: UserRole;
  name: string;
  email: string;
}) {
  const pathname = usePathname();

  const visible = (items: NavItem[]) =>
    items.filter((item) => !item.adminOnly || isAdmin(role));

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const items = visible(NAV);
  const utility = visible(UTILITY_NAV);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-4 pb-6">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Not a nav destination, so it must never render as active. */}
            <SidebarMenuButton
              asChild
              size="lg"
              className={cn('h-14 justify-center hover:bg-transparent', NEVER_ACTIVE)}
            >
              {/* The name is on the link so assistive tech reads "DevOps Portal"
                  as one phrase — PORTAL is split into individual letters below,
                  which would otherwise be announced one at a time. */}
              <Link href="/dashboard" aria-label="DevOps Portal">
                {/* Stacked, centred wordmark. The `grid` shrink-wraps to its widest
                    child — DEVOPS — which is what lets the second line measure
                    itself against the first. Hidden on the icon rail rather than
                    left to be clipped by the button's `overflow-hidden`, which
                    would show a "DEV" fragment. */}
                <span className="grid justify-items-center group-data-[collapsible=icon]:hidden">
                  {/* `tracking-wide`, not `tracking-tighter`: tight tracking is for
                      mixed case; caps at this size need the air. */}
                  <span className="font-display text-headline-lg font-bold tracking-wide text-sidebar-primary-foreground">
                    DEVOPS
                  </span>
                  {/* Spread to exactly the width of DEVOPS above it. `justify-between`
                      on the letters rather than a guessed `tracking-*` value, so the
                      two lines stay flush even if the wordmark's size or face
                      changes — and with no trailing gap, which a letter-spacing
                      approach always leaves after the last glyph. */}
                  <span
                    aria-hidden
                    className="flex w-full justify-between font-mono text-[10px] leading-none text-sidebar-foreground/70"
                  >
                    {'PORTAL'.split('').map((letter, i) => (
                      <span key={i}>{letter}</span>
                    ))}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* No group label — the design leads straight into the items. */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    className={navItemClass(isActive(item.href))}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-4">
        {utility.length ? (
          <SidebarMenu className="gap-2">
            {utility.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.href)}
                  tooltip={item.label}
                  className={navItemClass(isActive(item.href))}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        ) : null}

        {/* The account menu — the app's only identity display, and the only route
            to sign-out. It was previously duplicated: plain text here plus a
            clickable menu in the top bar, showing the same name twice. */}
        <SidebarMenu className="border-t border-sidebar-border pt-2">
          <SidebarMenuItem>
            <UserMenu role={role} name={name} email={email} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
