-- ElderShield 2.0 Row Level Security (RLS) Policies
-- Ensures members only access profiles and records for which they have active, scoped authorization.

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.medications enable row level security;
alter table public.medication_events enable row level security;
alter table public.medication_change_logs enable row level security;
alter table public.appointments enable row level security;
alter table public.caregiver_notes enable row level security;
alter table public.care_tasks enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_events enable row level security;
alter table public.emergency_contacts enable row level security;

create or replace function public.is_active_member(target_profile uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = target_profile
      and m.user_id = auth.uid()
      and m.active = true
      and m.revoked_at is null
  );
$$;

create or replace function public.has_profile_permission(target_profile uuid, perm text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = target_profile
      and m.user_id = auth.uid()
      and m.active = true
      and m.revoked_at is null
      and (m.role = 'elderly_owner' or m.permissions ? perm)
  );
$$;

-- Profiles: active members can view; only owner can update
create policy "profiles_select_member" on public.profiles
  for select using (public.is_active_member(id));
create policy "profiles_update_owner" on public.profiles
  for update using (owner_user_id = auth.uid());

-- Memberships: active members can read circle; only manage_members (owner) can update/revoke
create policy "memberships_select" on public.memberships
  for select using (public.is_active_member(profile_id));
create policy "memberships_manage" on public.memberships
  for all using (public.has_profile_permission(profile_id, 'manage_members'));

-- Invitations: only manage_members (owner) can view/create/revoke; redemption runs via service-role Edge Function
create policy "invitations_owner_only" on public.invitations
  for all using (public.has_profile_permission(profile_id, 'manage_members'));

-- Medications: active members can view; manage_medications can write
create policy "medications_select" on public.medications
  for select using (public.is_active_member(profile_id));
create policy "medications_write" on public.medications
  for all using (public.has_profile_permission(profile_id, 'manage_medications'));

-- Medication Events: active members can view; record_medication_status can insert
create policy "med_events_select" on public.medication_events
  for select using (public.is_active_member(profile_id));
create policy "med_events_insert" on public.medication_events
  for insert with check (public.has_profile_permission(profile_id, 'record_medication_status'));

-- Appointments: view_appointments to read; manage_appointments to write
create policy "appointments_select" on public.appointments
  for select using (public.has_profile_permission(profile_id, 'view_appointments'));
create policy "appointments_write" on public.appointments
  for all using (public.has_profile_permission(profile_id, 'manage_appointments'));

-- Caregiver Notes: active members read; add_care_notes insert; acknowledge_alerts update
create policy "care_notes_select" on public.caregiver_notes
  for select using (public.is_active_member(profile_id));
create policy "care_notes_insert" on public.caregiver_notes
  for insert with check (public.has_profile_permission(profile_id, 'add_care_notes'));
create policy "care_notes_ack" on public.caregiver_notes
  for update using (public.has_profile_permission(profile_id, 'acknowledge_alerts'));

-- Notification Preferences & Outbox
create policy "notif_prefs_select" on public.notification_preferences
  for select using (public.is_active_member(profile_id));
create policy "notif_outbox_select" on public.notification_outbox
  for select using (public.has_profile_permission(profile_id, 'manage_notifications'));

-- Audit Events & Emergency Contacts
create policy "audit_select" on public.audit_events
  for select using (public.is_active_member(profile_id));
create policy "emergency_contacts_select" on public.emergency_contacts
  for select using (public.is_active_member(profile_id));
create policy "emergency_contacts_write" on public.emergency_contacts
  for all using (public.has_profile_permission(profile_id, 'manage_members'));
