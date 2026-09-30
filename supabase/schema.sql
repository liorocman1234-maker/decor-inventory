-- Inventory schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Column names match src/lib/types.ts, and the cascades match src/lib/db.ts.

-- ---------------------------------------------------------------------------
-- Who may use the app. The site and its publishable key are public, so being
-- signed in is not enough: a user must also be listed here. Rows are added by
-- the project owner from the SQL editor (see README).
-- ---------------------------------------------------------------------------
create table public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
grant select on table public.team_members to authenticated;

create policy "members can see their own membership"
  on public.team_members for select to authenticated
  using ((select auth.uid()) = user_id);

-- Runs as the caller, so it only ever sees the caller's own membership row.
create function public.is_team_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Data tables
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#B9C2BB',
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  field_type text not null default 'text' check (field_type in ('text', 'number', 'select')),
  options jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.categories (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  tracking text not null default 'reusable' check (tracking in ('reusable', 'consumable')),
  location text not null default '',
  description text not null default '',
  image_url text,
  cost_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  min_quantity integer not null default 0,
  buffer_days integer not null default 0 check (buffer_days >= 0),
  custom_values jsonb not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  name text not null default '',
  sku text not null default '',
  created_at timestamptz not null default now()
);

-- A per-table recipe ("vintage table": 3 books, 2 candlesticks, 1 vase).
create table public.kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text not null default '',
  client_phone text not null default '',
  venue text not null default '',
  event_date date not null,
  return_date date not null,
  status text not null default 'planned' check (status in ('planned', 'out', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (return_date >= event_date)
);

create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  returned integer not null default 0,
  damaged integer not null default 0,
  lost integer not null default 0,
  consumed integer not null default 0,
  sold integer not null default 0,
  packed boolean not null default false,
  checked_back boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, variant_id)
);

-- Append-only stock ledger: owned quantity of a variant = sum(quantity).
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.variants (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'adjust', 'consumed', 'sold', 'damaged', 'lost')),
  quantity integer not null,
  unit_price numeric(12, 2) not null default 0,
  event_id uuid references public.events (id) on delete set null,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index on public.items (category_id);
create index on public.items (supplier_id);
create index on public.variants (item_id);
create index on public.kit_items (kit_id);
create index on public.kit_items (variant_id);
create index on public.event_items (variant_id);
create index on public.movements (variant_id);
create index on public.movements (event_id);

-- ---------------------------------------------------------------------------
-- Access: every table is exposed to signed-in users only, and row level
-- security then limits it to team members. The team shares one inventory, so
-- there is no per-row ownership.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'suppliers', 'custom_fields', 'items', 'variants', 'kits', 'kit_items', 'events', 'event_items', 'movements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy "team members have full access" on public.%I for all to authenticated
         using ((select public.is_team_member()))
         with check ((select public.is_team_member()))',
      t
    );
    -- Push changes to the other devices.
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Item photos. The bucket is public so photos load by URL; only team members
-- can upload, replace or delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

create policy "team members can view item images"
  on storage.objects for select to authenticated
  using (bucket_id = 'item-images' and (select public.is_team_member()));

create policy "team members can upload item images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images' and (select public.is_team_member()));

create policy "team members can replace item images"
  on storage.objects for update to authenticated
  using (bucket_id = 'item-images' and (select public.is_team_member()))
  with check (bucket_id = 'item-images' and (select public.is_team_member()));

create policy "team members can delete item images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'item-images' and (select public.is_team_member()));
