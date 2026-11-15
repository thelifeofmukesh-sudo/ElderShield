import type { Member, PermissionKey, Role } from '../types/eldershield';

export const ROLE_LABELS: Record<Role, string> = {
  elderly_owner: 'Elderly Profile Owner',
  family_member: 'Family Member',
  caretaker: 'Caretaker',
};

export const PERMISSION_DESCRIPTIONS: Record<
  PermissionKey,
  { label: string; explanation: string }
> = {
  view_profile: {
    label: 'View Healthcare Profile',
    explanation: 'View basic profile details, allergies note, and permitted HealthVault sections.',
  },
  manage_medications: {
    label: 'Add & Edit Medication Schedules',
    explanation: 'Create, modify, or discontinue scheduled medication entries with full audit logs.',
  },
  record_medication_status: {
    label: 'Record Medication Taken or Skipped',
    explanation: 'Confirm scheduled doses as taken or record skipped entries with notes.',
  },
  view_appointments: {
    label: 'View Doctor Appointments',
    explanation: 'See upcoming and past clinic appointments, locations, and preparation notes.',
  },
  manage_appointments: {
    label: 'Schedule & Reschedule Appointments',
    explanation: 'Add, edit, reschedule, or cancel doctor appointments and follow-up tasks.',
  },
  add_care_notes: {
    label: 'Write Care & Handover Notes',
    explanation: 'Record daily care activities and shift handover instructions for the care circle.',
  },
  manage_members: {
    label: 'Manage Access & Invitations',
    explanation: 'Generate expiring passcode invitations, update member permissions, or revoke access.',
  },
  manage_notifications: {
    label: 'Configure Reminder Preferences',
    explanation: 'Manage email notification categories, quiet hours, and inspect outbox queue.',
  },
  acknowledge_alerts: {
    label: 'Acknowledge CareSense Alerts',
    explanation: 'Review and mark contextual care alerts and handover items as acknowledged.',
  },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  elderly_owner: [
    'view_profile',
    'manage_medications',
    'record_medication_status',
    'view_appointments',
    'manage_appointments',
    'add_care_notes',
    'manage_members',
    'manage_notifications',
    'acknowledge_alerts',
  ],
  family_member: [
    'view_profile',
    'manage_medications',
    'record_medication_status',
    'view_appointments',
    'manage_appointments',
    'add_care_notes',
    'manage_notifications',
    'acknowledge_alerts',
  ],
  caretaker: [
    'view_profile',
    'record_medication_status',
    'view_appointments',
    'add_care_notes',
    'acknowledge_alerts',
  ],
};

export function hasPermission(member: Member | undefined, permission: PermissionKey): boolean {
  if (!member || !member.active) return false;
  if (member.role === 'elderly_owner') return true;
  return member.permissions.includes(permission);
}
