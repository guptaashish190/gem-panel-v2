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
