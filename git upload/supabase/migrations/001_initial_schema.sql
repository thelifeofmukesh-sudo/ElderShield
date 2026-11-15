-- ElderShield 2.0 Initial PostgreSQL Schema
-- Covers all 12 core domain entities + medication change audit trail.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  preferred_name text not null,
  birth_year int,
  timezone text not null default 'UTC',
  allergies_note text default '',
  primary_physician text default '',
  care_preferences text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  role text not null check (role in ('elderly_owner', 'family_member', 'caretaker')),
  relationship text not null default '',
  permissions jsonb not null default '[]'::jsonb,
  healthvault_consent jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (profile_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  recipient_email_hint text default '',
  role text not null check (role in ('family_member', 'caretaker')),
  permissions jsonb not null default '[]'::jsonb,
  code_salt text not null,
  code_hash text not null,
  code_masked text not null,
  expires_at timestamptz not null,
  max_attempts int not null default 5,
  attempt_count int not null default 0,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  instructions text not null,
  scheduled_time time not null,
  frequency text not null check (frequency in ('daily', 'specific_days')),
  selected_days int[] not null default '{0,1,2,3,4,5,6}',
  start_date date not null default current_date,
  end_date date,
  notes text default '',
  prescriber_name text default '',
  reminder_window_minutes int not null default 30,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.medication_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  date_key date not null,
  scheduled_time time not null,
  status text not null check (status in ('taken', 'skipped')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  note text default '',
  deduplication_key text not null unique
);

create table if not exists public.medication_change_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  field text not null,
  previous_value text,
  new_value text,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  doctor_name text not null,
  specialty text default '',
  clinic_name text not null,
  location text default '',
  appt_date date not null,
  appt_time time not null,
  status text not null check (status in ('upcoming', 'completed', 'cancelled', 'rescheduled')),
  preparation_notes text default '',
  follow_up_notes text default '',
  reminder_lead_hours int not null default 24,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.caregiver_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('handover', 'daily_care', 'follow_up')),
  completed_summary text not null,
  attention_needed text default '',
  note_text text default '',
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz
);

create table if not exists public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  completed boolean not null default false,
  assigned_to uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.memberships(id) on delete cascade,
  email_enabled boolean not null default true,
  upcoming_medication boolean not null default true,
  unconfirmed_medication boolean not null default true,
  upcoming_appointment boolean not null default true,
  appointment_rescheduled boolean not null default true,
  caregiver_follow_up boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  unique (profile_id, member_id)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  deduplication_key text not null unique,
  recipient_member_id uuid not null references public.memberships(id) on delete cascade,
  recipient_email text not null,
  category text not null,
  subject text not null,
  body_preview text not null,
  related_entity_type text not null,
  related_entity_id text not null,
  scheduled_for timestamptz not null default now(),
  status text not null check (status in ('queued', 'sent_live', 'failed', 'suppressed_quiet_hours', 'cancelled')),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  error_message text
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action_type text not null,
  summary text not null,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  relationship text not null,
  phone text not null,
  notes text default '',
  priority int not null default 1
);
