-- Enum for roles
create type public.app_role as enum ('admin', 'employee');

-- Companies table
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  industry text,
  employee_count text,
  years_operating text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

-- Company settings (onboarding answers)
create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null unique,
  sells_products boolean default false,
  sells_services boolean default false,
  has_stock boolean default false,
  has_logistics boolean default false,
  supplier_lead_days integer,
  sku_count text,
  has_recurring_clients boolean default false,
  has_wholesale_prices boolean default false,
  accounting_method text,
  crm_erp text,
  uses_meta_ads boolean default false,
  uses_google_ads boolean default false,
  goals text[] default '{}',
  onboarding_completed boolean default false,
  onboarding_completion_pct integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- File uploads table
create table public.file_uploads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text,
  status text default 'processing',
  created_at timestamptz default now()
);

-- Security definer function for role checks
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- Updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- Triggers for updated_at
create trigger update_companies_updated_at before update on public.companies for each row execute function public.update_updated_at_column();
create trigger update_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger update_company_settings_updated_at before update on public.company_settings for each row execute function public.update_updated_at_column();

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.company_settings enable row level security;
alter table public.file_uploads enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Companies policies
create policy "Users can view own company" on public.companies for select using (
  id in (select company_id from public.profiles where id = auth.uid())
);
create policy "Admins can update company" on public.companies for update using (
  id in (select company_id from public.profiles where id = auth.uid()) and public.has_role(auth.uid(), 'admin')
);

-- User roles policies
create policy "Users can view own roles" on public.user_roles for select using (user_id = auth.uid());

-- Company settings policies
create policy "Users can view own company settings" on public.company_settings for select using (
  company_id in (select company_id from public.profiles where id = auth.uid())
);
create policy "Admins can manage company settings" on public.company_settings for update using (
  company_id in (select company_id from public.profiles where id = auth.uid()) and public.has_role(auth.uid(), 'admin')
);

-- File uploads policies
create policy "Users can view own uploads" on public.file_uploads for select using (
  uploaded_by = auth.uid() or (
    company_id in (select company_id from public.profiles where id = auth.uid()) and public.has_role(auth.uid(), 'admin')
  )
);
create policy "Users can insert uploads" on public.file_uploads for insert with check (uploaded_by = auth.uid());
create policy "Admins can delete uploads" on public.file_uploads for delete using (
  uploaded_by = auth.uid() or public.has_role(auth.uid(), 'admin')
);

-- Trigger: auto-create profile, company, role, and settings on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into public.companies (name) values ('') returning id into new_company_id;
  insert into public.profiles (id, full_name, company_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new_company_id);
  insert into public.user_roles (user_id, role) values (new.id, 'admin');
  insert into public.company_settings (company_id) values (new_company_id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket for file uploads
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);

create policy "Users can upload files" on storage.objects for insert with check (bucket_id = 'uploads' and auth.uid() is not null);
create policy "Users can view own files" on storage.objects for select using (bucket_id = 'uploads' and auth.uid() is not null);
create policy "Users can delete own files" on storage.objects for delete using (bucket_id = 'uploads' and auth.uid() is not null);