'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  LayoutDashboard,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/rbac';
import type { UserRole } from '@/types/common';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/tracker', label: 'VM Tracker', icon: Server },
  { href: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
  { href: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

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

  const items = NAV.filter((item) => !item.adminOnly || isAdmin(role));

  // `profiles.name` is optional, so fall back to the address rather than
  // rendering an empty row. Matches `UserMenu`.
  const label = name.trim() || email;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/dashboard">
                {/* The accent step, not `bg-primary` — `primary` is a dark mauve
                    and the sidebar is the darkest, so the mark would disappear
                    into it. */}
                <span className="grid aspect-square size-8 place-items-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  UV
                </span>
                <span className="font-semibold">UPVIEW Deploy</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        'h-11 gap-3 text-[15px] [&>svg]:size-5',
                        // The primitive styles the active item with
                        // `data-active:bg-sidebar-accent`, but it renders
                        // `data-active={isActive}` *unconditionally* — and React
                        // stringifies a `data-*` false, so the attribute is always
                        // present as "false". Tailwind's `data-active:` compiles to
                        // `[data-active]`, i.e. attribute presence, so that rule
                        // matched every item and the entire nav rendered filled.
                        // (Same family as the Radix boolean-attribute trap in
                        // docs/ui-guidelines.md.)
                        //
                        // Restating the same variant lets tailwind-merge drop the
                        // primitive's version, neutralising it for every item…
                        'data-active:bg-transparent data-active:font-normal data-active:text-sidebar-foreground',
                        // …then the real active item is styled from React state.
                        // `!` because both rules land at equal specificity and
                        // emission order shouldn't decide which one wins.
                        active &&
                          'bg-sidebar-primary! font-semibold text-sidebar-primary-foreground! hover:bg-sidebar-primary! hover:text-sidebar-primary-foreground!'
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Identity only — name and role as plain text. The clickable account menu
          (and sign-out) lives in the top bar, so nothing here is interactive. */}
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="size-8 shrink-0 rounded-md">
            {/* The default fallback tone is tuned for a light surface. */}
            <AvatarFallback className="rounded-md bg-sidebar-accent text-xs font-semibold uppercase text-sidebar-foreground">
              {label.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {/* Collapsed to the icon rail, the avatar stands in for both lines. */}
          <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{label}</span>
            <span className="truncate text-xs capitalize text-sidebar-foreground/70">{role}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
