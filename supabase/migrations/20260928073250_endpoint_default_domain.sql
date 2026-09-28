-- The platform-assigned hostname of a managed-platform record.
--
-- AWS, Azure and Amplify give every deployment an address of their own before
-- anyone points a domain at it — `matrimony-fe-….azurewebsites.net`,
-- `main.d1abc.amplifyapp.com`. It is what a VM record's `ip:port` link is on
-- Jenkins/other: the address that works first, independent of DNS. `domain`
-- stays the **custom** domain in front of it.
--
-- Hand-entered, shown as its own column only on the managed providers
-- (`providerHasDefaultDomain` in types/common/project.ts). Existing on every row
-- regardless of provider, like `branch`, so switching an environment's provider
-- only changes what's displayed.
--
-- Free text, defaulting to '' so existing rows stay valid with no backfill.

alter table public.endpoints
  add column if not exists default_domain text not null default '';
