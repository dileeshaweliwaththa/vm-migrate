-- Shared helper functions reused by later migrations.
-- Apply this FIRST, before any numbered table script that references it.

-- Keeps an `updated_at timestamptz` column in sync on every UPDATE.
-- Attach to a table with:
--   create trigger set_updated_at before update on public.<table>
--     for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
