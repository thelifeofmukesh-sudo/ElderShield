export type Role = 'elderly_owner' | 'family_member' | 'caretaker';

export type PermissionKey =
  | 'view_profile'
  | 'manage_medications'
  | 'record_medication_status'
  | 'view_appointments'
  | 'manage_appointments'
  | 'add_care_notes'
  | 'manage_members'
  | 'manage_notifications'
  | 'acknowledge_alerts';

export type MedicationComputedStatus =
  | 'upcoming'
  | 'due'
  | 'taken'
  | 'skipped'
  | 'unconfirmed';

export type AppointmentStatus =
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export type NotificationCategory =
  | 'upcoming_medication'
  | 'unconfirmed_medication'
  | 'upcoming_appointment'
  | 'appointment_rescheduled'
  | 'caregiver_follow_up';

export type NotificationDeliveryStatus =
  | 'queued'
  | 'simulated_sent'
  | 'sent_live'
  | 'failed'
  | 'suppressed_quiet_hours'
  | 'cancelled';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  relationship: string;
  permissions: PermissionKey[];
  active: boolean;
  joinedAt: string;
  avatarInitials: string;
  canViewHealthVaultCategories: {
    basicProfile: boolean;
    emergencyContacts: boolean;
    healthcareNotes: boolean;
    prescriberDetails: boolean;
    medicationList: boolean;
    appointmentHistory: boolean;
  };
}

export interface Invitation {
  id: string;
  profileId: string;
  label: string;
  recipientEmailHint: string;
  role: Exclude<Role, 'elderly_owner'>;
  permissions: PermissionKey[];
  codeHash: string;
  codeMasked: string;
  expiresAt: string;
  maxAttempts: number;
  attemptCount: number;
  redeemedAt: string | null;
  redeemedByMemberId: string | null;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Medication {
  id: string;
  name: string;
  instructions: string;
  scheduledTime: string; // HH:MM 24h
  frequency: 'daily' | 'specific_days';
  selectedDays: number[]; // 0=Sun .. 6=Sat
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  notes: string;
  prescriberName: string;
  reminderWindowMinutes: number;
  active: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface MedicationEvent {
  id: string;
  medicationId: string;
  dateKey: string; // YYYY-MM-DD
  scheduledTime: string;
  status: 'taken' | 'skipped';
  recordedByMemberId: string;
  recordedByName: string;
  recordedByRole: Role;
  recordedAt: string;
  note: string;
  deduplicationKey: string;
}

export interface MedicationChangeLog {
  id: string;
  medicationId: string;
  medicationName: string;
  field: string;
  previousValue: string;
  newValue: string;
  changedByName: string;
  changedByRole: Role;
  changedAt: string;
}

export interface Appointment {
  id: string;
  doctorName: string;
  specialty: string;
  clinicName: string;
  location: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: AppointmentStatus;
  preparationNotes: string;
  followUpNotes: string;
  reminderLeadHours: number;
  updatedByName: string;
  updatedAt: string;
}

export interface CaregiverNote {
  id: string;
  category: 'handover' | 'daily_care' | 'follow_up';
  completedSummary: string;
  attentionNeeded: string;
  noteText: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface NotificationPreference {
  memberId: string;
  emailEnabled: boolean;
  upcomingMedication: boolean;
  unconfirmedMedication: boolean;
  upcomingAppointment: boolean;
  appointmentRescheduled: boolean;
  caregiverFollowUp: boolean;
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string; // HH:MM
}

export interface NotificationOutboxItem {
  id: string;
  deduplicationKey: string;
  recipientMemberId: string;
  recipientName: string;
  recipientEmail: string;
  category: NotificationCategory;
  subject: string;
  bodyPreview: string;
  relatedEntityType: 'medication' | 'appointment' | 'caregiver_note' | 'system_test';
  relatedEntityId: string;
  scheduledFor: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  deliveryMode: 'demo_simulation' | 'resend_live';
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  actionType: string;
  summary: string;
  entityType: string;
  entityId: string;
  timestamp: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  notes: string;
  priority: number;
}

export interface HealthProfile {
  id: string;
  displayName: string;
  preferredName: string;
  birthYear: number;
  timezone: string;
  allergiesNote: string;
  primaryPhysician: string;
  carePreferences: string;
  isDemoData: boolean;
}

export type CareSenseScenarioCode =
  | 'A_UPCOMING_MED'
  | 'B_DUE_MED'
  | 'C_OVERDUE_MED'
  | 'D_TAKEN'
  | 'E_SKIPPED'
  | 'F_REPEATED_UNCONFIRMED'
  | 'G_UPCOMING_APPT'
  | 'H_RESCHEDULED_APPT'
  | 'I_HANDOVER'
  | 'J_PREF_FILTER';

export interface CareSenseRecipientDecision {
  memberId: string;
  name: string;
  role: Role;
  notified: boolean;
  reason: string;
}

export interface CareSenseDecision {
  id: string;
  scenarioCode: CareSenseScenarioCode;
  title: string;
  severity: 'info' | 'attention' | 'urgent';
  whatHappened: string;
  whyDetected: string;
  relevantRecords: string[];
  whoShouldBeInformed: CareSenseRecipientDecision[];
  appropriateAction: string;
  suggestedNotificationCategory?: NotificationCategory;
  relatedEntityType?: 'medication' | 'appointment' | 'caregiver_note';
  relatedEntityId?: string;
  acknowledged: boolean;
  generatedAt: string;
}

export interface ElderShieldState {
  profile: HealthProfile;
  members: Member[];
  invitations: Invitation[];
  medications: Medication[];
  medicationEvents: MedicationEvent[];
  medicationChangeLogs: MedicationChangeLog[];
  appointments: Appointment[];
  caregiverNotes: CaregiverNote[];
  notificationPreferences: NotificationPreference[];
  notificationOutbox: NotificationOutboxItem[];
  auditEvents: AuditEvent[];
  emergencyContacts: EmergencyContact[];
  acknowledgedDecisionIds: string[];
  simulatedNowIso: string | null;
}

export type ActiveTab =
  | 'today'
  | 'meditrack'
  | 'appointments'
  | 'caresense'
  | 'familyconnect'
  | 'notifycare'
  | 'healthvault'
  | 'demolab';
