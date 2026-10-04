-- ── Doctors ──────────────────────────────────────────────────────────────────

create table if not exists public.doctors (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  specialty       text        not null,
  license         text        not null unique,
  email           text        not null,
  phone           text,
  department      text,
  hospital        text,
  qualifications  text[]      not null default '{}',
  experience      int         not null default 0,
  status          text        not null default 'on-duty'
                              check (status in ('on-duty', 'off-duty')),
  schedule        text,
  bio             text,
  created_at      timestamptz not null default now()
);

-- ── Patients ─────────────────────────────────────────────────────────────────

create table if not exists public.patients (
  id                          uuid        primary key default gen_random_uuid(),
  name                        text        not null,
  dob                         date,
  gender                      text        check (gender in ('Male', 'Female', 'Other')),
  blood_type                  text,
  phone                       text,
  email                       text,
  address                     text,
  emergency_contact_name      text,
  emergency_contact_relation  text,
  emergency_contact_phone     text,
  weight                      numeric,
  height                      numeric,
  status                      text        not null default 'admitted'
                                          check (status in ('admitted', 'outpatient', 'discharged')),
  admission_date              date,
  discharge_date              date,
  ward                        text,
  room                        text,
  bed                         text,
  insurance_provider          text,
  insurance_policy_number     text,
  insurance_expiry            date,
  doctor_id                   uuid        references public.doctors(id) on delete set null,
  primary_diagnosis           text,
  secondary_diagnoses         text[]      not null default '{}',
  allergies                   text[]      not null default '{}',
  medications                 jsonb       not null default '[]',
  medical_history             text[]      not null default '{}',
  device_id                   text,
  connection_status           text        not null default 'disconnected',
  current_hr                  int,
  current_spo2                int,
  current_rr                  int,
  last_reading                timestamptz,
  recent_anomalies            jsonb       not null default '[]',
  notes                       text,
  created_at                  timestamptz not null default now(),
  created_by                  uuid        references auth.users(id) on delete set null
);

-- ── Profiles (roles) ─────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid  primary key references auth.users(id) on delete cascade,
  role        text  not null default 'doctor' check (role in ('admin', 'doctor')),
  doctor_id   uuid  references public.doctors(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── Row-level security ────────────────────────────────────────────────────────

alter table public.doctors  enable row level security;
alter table public.patients enable row level security;
alter table public.profiles enable row level security;

-- Profiles: users can only read their own row
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Doctors: any authenticated user can read
create policy "doctors_select" on public.doctors
  for select to authenticated using (true);

-- Doctors: only admins can insert / update / delete
create policy "doctors_insert_admin" on public.doctors
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "doctors_update_admin" on public.doctors
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "doctors_delete_admin" on public.doctors
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Patients: any authenticated user can read
create policy "patients_select" on public.patients
  for select to authenticated using (true);

-- Patients: any authenticated user can insert or update
create policy "patients_insert" on public.patients
  for insert to authenticated with check (true);

create policy "patients_update" on public.patients
  for update to authenticated using (true);

-- Patients: only admins can delete
create policy "patients_delete_admin" on public.patients
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── Auto-create profile on signup ────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'doctor')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
