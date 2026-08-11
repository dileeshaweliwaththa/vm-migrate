'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProject } from '@/hooks/projects/useProjects';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

// Where the top bar says you are. Derived from the pathname rather than passed
// down, because the bar is rendered by the app layout — above the page that knows
// its own title.
//
// `/admin` is a routing group, not a destination, so it never appears as a crumb.
const SECTION_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tracker: 'VM Tracker',
  users: 'Users',
  settings: 'Settings',
};

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // The one dynamic route in the app. The id in the URL is a UUID, which is no
  // use as a label, so the crumb shows the project's name instead — read through
  // the *same* query key the detail page uses, so this shares that request rather
  // than issuing a second one, and fills in as soon as it resolves.
  const projectId = segments[0] === 'projects' && segments[1] ? segments[1] : '';
  const { data: project } = useProject(projectId);

  const crumbs: Crumb[] = [];
  for (const segment of segments) {
    if (segment === 'admin') continue;
    const label = SECTION_LABEL[segment];
    if (label) {
      crumbs.push({ label, href: `/${segment === 'users' || segment === 'settings' ? 'admin/' : ''}${segment}` });
      continue;
    }
    // An unmapped segment is a record id — currently only a project's.
    if (segment === projectId) crumbs.push({ label: project?.name ?? '…' });
  }

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-2 text-body-sm">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          // The separator is a *sibling* of the item, not a child of it: both
          // primitives render an `<li>`, and an `<li>` inside an `<li>` is invalid
          // HTML that React reports as a hydration error.
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem>
                {last || !crumb.href ? (
                  <BreadcrumbPage className="max-w-[16rem] truncate font-medium">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator className="flex items-center" /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
