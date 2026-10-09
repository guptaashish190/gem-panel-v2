create table if not exists keyword_cursor (
  keyword text primary key,
  pages_searched integer not null default 0
);

create table if not exists tender (
  bid_number text primary key,
  listing_id text not null,
  bid_end text,
  offer_validity text,
  ministry_or_state text,
  department text,
  buyer_email text,
  hod_email text,
  evaluation_method text,
  type_of_bid text,
  bid_to_ra text,
  ra_qualification_rule text,
  payment_timeline_days integer,
  bidder_documents_shown boolean,
  required_document_names text[] not null default '{}',
  mse boolean,
  mii boolean,
  l1_plus_percent numeric,
  quantity_percent numeric,
  emd_required boolean,
  emd_amount numeric,
  epbg_required boolean,
  epbg_percentage numeric,
  epbg_months integer,
  beneficiary_name text,
  saved boolean not null default false,
  status text
);

create index if not exists tender_ministry_or_state_idx on tender (ministry_or_state);
create index if not exists tender_evaluation_method_idx on tender (evaluation_method);
create index if not exists tender_mse_idx on tender (mse);
create index if not exists tender_emd_required_idx on tender (emd_required);

alter table tender add column if not exists status text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tender' and column_name = 'filled'
  ) then
    update tender set status = 'Documentation' where filled is true and status is null;
    alter table tender drop column filled;
  end if;
end $$;

alter table tender drop constraint if exists tender_status_check;
alter table tender add constraint tender_status_check check (
  status is null
  or status in (
    'Documentation',
    'Bid Participated',
    'Technically Qualified',
    'Tender Completed'
  )
);

create table if not exists product (
  id bigint generated always as identity primary key,
  bid_number text not null references tender (bid_number) on delete cascade,
  name text not null,
  quantity numeric,
  delivery_period text,
  schedule_number integer
);

create table if not exists document (
  id bigint generated always as identity primary key,
  bid_number text not null references tender (bid_number) on delete cascade,
  name text not null,
  storage_key text,
  unique (bid_number, name)
);

insert into storage.buckets (id, name, public)
values ('tender-files', 'tender-files', false)
on conflict (id) do nothing;

create table if not exists company (
  id integer primary key default 1 check (id = 1),
  name text not null default '',
  authorized_signatory text not null default '',
  address text not null default '',
  drug_license_number text not null default ''
);

alter table company add column if not exists gstin text not null default '';
alter table company add column if not exists email text not null default '';
alter table company add column if not exists phone text not null default '';
alter table company add column if not exists udyam_number text not null default '';
alter table company add column if not exists fields jsonb not null default '[]'::jsonb;
alter table company add column if not exists logo text not null default '';

insert into company (id)
values (1)
on conflict (id) do nothing;

create table if not exists company_document (
  id bigint generated always as identity primary key,
  name text not null,
  storage_key text
);

create unique index if not exists company_document_name_idx on company_document (name);
create unique index if not exists company_document_name_lower_idx on company_document (lower(name));

create table if not exists template (
  id bigint generated always as identity primary key,
  name text not null,
  body text not null default ''
);

create unique index if not exists template_name_idx on template (name);
create unique index if not exists template_name_lower_idx on template (lower(name));

alter table keyword_cursor add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table keyword_cursor add column if not exists id bigint generated always as identity;
alter table keyword_cursor drop constraint if exists keyword_cursor_pkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keyword_cursor'::regclass and contype = 'p'
  ) then
    alter table keyword_cursor add primary key (id);
  end if;
end $$;
create unique index if not exists keyword_cursor_user_keyword_idx on keyword_cursor (user_id, keyword);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'company'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%id = 1%'
  loop
    execute format('alter table company drop constraint %I', constraint_name);
  end loop;
end $$;

alter table company add column if not exists user_id uuid references auth.users (id) on delete cascade;
create unique index if not exists company_user_id_idx on company (user_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company'
      and column_name = 'id'
      and is_identity = 'NO'
      and column_default is not null
  ) then
    alter table company alter column id drop default;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company'
      and column_name = 'id'
      and is_identity = 'NO'
  ) then
    alter table company alter column id add generated by default as identity;
  end if;
  perform setval(
    pg_get_serial_sequence('company', 'id'),
    greatest((select coalesce(max(id), 1) from company), 1)
  );
end $$;

alter table company_document add column if not exists user_id uuid references auth.users (id) on delete cascade;
drop index if exists company_document_name_idx;
drop index if exists company_document_name_lower_idx;
create unique index if not exists company_document_user_name_idx on company_document (user_id, lower(name));

alter table template add column if not exists user_id uuid references auth.users (id) on delete cascade;
drop index if exists template_name_idx;
drop index if exists template_name_lower_idx;
create unique index if not exists template_user_name_idx on template (user_id, lower(name));

create table if not exists user_tender (
  user_id uuid not null references auth.users (id) on delete cascade,
  bid_number text not null references tender (bid_number) on delete cascade,
  saved boolean not null default false,
  status text,
  primary key (user_id, bid_number)
);

alter table user_tender drop constraint if exists user_tender_status_check;
alter table user_tender add constraint user_tender_status_check check (
  status is null
  or status in (
    'Documentation',
    'Bid Participated',
    'Technically Qualified',
    'Tender Completed'
  )
);

create table if not exists user_document (
  user_id uuid not null references auth.users (id) on delete cascade,
  bid_number text not null references tender (bid_number) on delete cascade,
  name text not null,
  storage_key text,
  primary key (user_id, bid_number, name)
);

create table if not exists user_product_tag (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null references product (id) on delete cascade,
  primary key (user_id, product_id)
);

create or replace function bid_exists(target text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from tender where bid_number = target);
$$;

create or replace function remove_orphan_tender(target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from tender
  where bid_number = target
    and not exists (select 1 from user_tender where bid_number = target);
end;
$$;

drop function if exists legacy_pending();
drop function if exists claim_legacy();

revoke all on function bid_exists(text) from public;
revoke all on function remove_orphan_tender(text) from public;
grant execute on function bid_exists(text) to authenticated;
grant execute on function remove_orphan_tender(text) to authenticated;

grant select, insert, update, delete on
  tender, product, document, keyword_cursor, company, company_document, template, user_tender, user_document, user_product_tag
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table keyword_cursor enable row level security;
alter table tender enable row level security;
alter table product enable row level security;
alter table document enable row level security;
alter table company enable row level security;
alter table company_document enable row level security;
alter table template enable row level security;
alter table user_tender enable row level security;
alter table user_document enable row level security;
alter table user_product_tag enable row level security;

drop policy if exists keyword_cursor_all on keyword_cursor;
create policy keyword_cursor_all on keyword_cursor
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists tender_select on tender;
create policy tender_select on tender
for select to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = tender.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists tender_insert on tender;
create policy tender_insert on tender
for insert to authenticated
with check (auth.uid() is not null);

drop policy if exists tender_update on tender;
create policy tender_update on tender
for update to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = tender.bid_number and user_tender.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = tender.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists product_select on product;
create policy product_select on product
for select to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = product.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists product_insert on product;
create policy product_insert on product
for insert to authenticated
with check (auth.uid() is not null);

drop policy if exists product_delete on product;
create policy product_delete on product
for delete to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = product.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists document_select on document;
create policy document_select on document
for select to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = document.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists document_insert on document;
create policy document_insert on document
for insert to authenticated
with check (auth.uid() is not null);

drop policy if exists document_delete on document;
create policy document_delete on document
for delete to authenticated
using (
  exists (
    select 1 from user_tender
    where user_tender.bid_number = document.bid_number and user_tender.user_id = auth.uid()
  )
);

drop policy if exists company_all on company;
create policy company_all on company
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists company_document_all on company_document;
create policy company_document_all on company_document
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists template_all on template;
create policy template_all on template
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_tender_all on user_tender;
create policy user_tender_all on user_tender
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_document_all on user_document;
create policy user_document_all on user_document
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_product_tag_all on user_product_tag;
create policy user_product_tag_all on user_product_tag
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists tender_files_select on storage.objects;
create policy tender_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'tender-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_document
      where user_document.user_id = auth.uid() and user_document.storage_key = name
    )
    or exists (
      select 1 from public.company_document
      where company_document.user_id = auth.uid() and company_document.storage_key = name
    )
  )
);

drop policy if exists tender_files_insert on storage.objects;
create policy tender_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tender-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists tender_files_update on storage.objects;
create policy tender_files_update on storage.objects
for update to authenticated
using (
  bucket_id = 'tender-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'tender-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists tender_files_delete on storage.objects;
create policy tender_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'tender-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_document
      where user_document.user_id = auth.uid() and user_document.storage_key = name
    )
    or exists (
      select 1 from public.company_document
      where company_document.user_id = auth.uid() and company_document.storage_key = name
    )
  )
);
