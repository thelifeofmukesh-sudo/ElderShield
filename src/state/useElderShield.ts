import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, createDemoSeedState, formatDateKey } from '../data/demoSeed';
import { getEffectiveNow, runCareSenseEngine, toDateKey } from '../engine/caresense';
import { buildPrivacySafeEmailCopy, queueNotificationsFromDecisions } from '../engine/notifications';
import { DEFAULT_ROLE_PERMISSIONS, hasPermission } from '../engine/permissions';
import { clearElderShieldState, loadElderShieldState, saveElderShieldState } from '../services/storage';
import type {
  Appointment,
  CaregiverNote,
  ElderShieldState,
  EmergencyContact,
  Invitation,
  Medication,
  MedicationChangeLog,
  Member,
  NotificationCategory,
  NotificationPreference,
  PermissionKey,
  Role,
} from '../types/eldershield';

export interface BackendCapabilities {
  emailProviderConfigured: boolean;
  emailProviderName: string;
  supabaseConfigured: boolean;
  mode: 'local_demo_mode' | 'supabase_configured';
  reachable: boolean;
}

export function useElderShield() {
  const initial = useMemo(() => loadElderShieldState(), []);
  const [state, setState] = useState<ElderShieldState>(initial.state);
  const [activeMemberId, setActiveMemberId] = useState<string>('member_owner_arthur');
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.storageWarning);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);
  const [capabilities, setCapabilities] = useState<BackendCapabilities>({
    emailProviderConfigured: false,
    emailProviderName: 'Demo Simulation Only',
    supabaseConfigured: false,
    mode: 'local_demo_mode',
    reachable: false,
  });

  useEffect(() => {
    const warn = saveElderShieldState(state);
    if (warn) setStorageWarning(warn);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok) {
          setCapabilities({
            emailProviderConfigured: Boolean(data.emailProviderConfigured),
            emailProviderName: data.emailProviderName || 'Demo Simulation Only',
            supabaseConfigured: Boolean(data.supabaseConfigured),
            mode: data.mode || 'local_demo_mode',
            reachable: true,
          });
        }
      })
      .catch(() => {
        // Static or offline mode; keep reachable: false
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentMember = useMemo(
    () => state.members.find((m) => m.id === activeMemberId && m.active) ?? state.members[0],
    [state.members, activeMemberId]
  );

  const effectiveNow = useMemo(() => getEffectiveNow(state), [state]);
  const decisions = useMemo(() => runCareSenseEngine(state), [state]);

  const notify = useCallback((type: 'info' | 'success' | 'error', text: string) => {
    setBannerMessage({ type, text });
  }, []);

  const appendAudit = (
    draft: ElderShieldState,
    actionType: string,
    summary: string,
    entityType: string,
    entityId: string
  ) => {
    const actor = draft.members.find((m) => m.id === activeMemberId) ?? draft.members[0];
    draft.auditEvents = [
      {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        actionType,
        summary,
        entityType,
        entityId,
        timestamp: new Date().toISOString(),
      },
      ...draft.auditEvents,
    ].slice(0, 120);
  };

  // Record Medication Taken or Skipped (prevents duplicate completion)
  const recordMedicationEvent = useCallback(
    (medicationId: string, status: 'taken' | 'skipped', note = '') => {
      if (!hasPermission(currentMember, 'record_medication_status')) {
        notify('error', 'Your current role does not have permission to record medication status.');
        return;
      }

      setState((prev) => {
        const now = getEffectiveNow(prev);
        const dateKey = toDateKey(now);
        const med = prev.medications.find((m) => m.id === medicationId);
        if (!med) return prev;

        const dedupKey = `${med.id}_${dateKey}_${med.scheduledTime}`;
        const alreadyExists = prev.medicationEvents.some((e) => e.deduplicationKey === dedupKey);
        if (alreadyExists) {
          notify('info', `${med.name} for ${dateKey} at ${med.scheduledTime} is already recorded.`);
          return prev;
        }

        const next: ElderShieldState = {
          ...prev,
          medicationEvents: [
            {
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              medicationId: med.id,
              dateKey,
              scheduledTime: med.scheduledTime,
              status,
              recordedByMemberId: currentMember.id,
              recordedByName: currentMember.name,
              recordedByRole: currentMember.role,
              recordedAt: now.toISOString(),
              note: note.trim(),
              deduplicationKey: dedupKey,
            },
            ...prev.medicationEvents,
          ],
          auditEvents: [...prev.auditEvents],
        };

        appendAudit(
          next,
          `medication.${status}`,
          `${currentMember.name} marked ${med.name} (${med.scheduledTime}) as ${status}.`,
          'medication',
          med.id
        );

        notify(
          'success',
          status === 'taken'
            ? `Confirmed ${med.name} as taken.`
            : `Recorded ${med.name} as skipped. Never take an extra dose without prescriber advice.`
        );
        return next;
      });
    },
    [currentMember, notify]
  );

  const addMedication = useCallback(
    (input: Omit<Medication, 'id' | 'active' | 'createdBy' | 'updatedAt'>) => {
      if (!hasPermission(currentMember, 'manage_medications')) {
        notify('error', 'Your role cannot add medication schedules.');
        return;
      }
      setState((prev) => {
        const id = `med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const nowIso = new Date().toISOString();
        const newMed: Medication = {
          ...input,
          id,
          active: true,
          createdBy: currentMember.name,
          updatedAt: nowIso,
        };
        const next: ElderShieldState = {
          ...prev,
          medications: [...prev.medications, newMed],
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'medication.created',
          `Added medication schedule: ${newMed.name} at ${newMed.scheduledTime}.`,
          'medication',
          id
        );
        notify('success', `Added ${newMed.name} to the shared schedule.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  const updateMedication = useCallback(
    (id: string, updates: Partial<Medication>) => {
      if (!hasPermission(currentMember, 'manage_medications')) {
        notify('error', 'Your role cannot edit medication schedules.');
        return;
      }
      setState((prev) => {
        const existing = prev.medications.find((m) => m.id === id);
        if (!existing) return prev;
        const nowIso = new Date().toISOString();
        const changeLogs: MedicationChangeLog[] = [];

        const trackedFields: Array<{ key: keyof Medication; label: string }> = [
          { key: 'name', label: 'Medication Name' },
          { key: 'scheduledTime', label: 'Scheduled Time' },
          { key: 'instructions', label: 'Instructions' },
          { key: 'prescriberName', label: 'Prescriber' },
          { key: 'reminderWindowMinutes', label: 'Reminder Window (min)' },
        ];

        for (const f of trackedFields) {
          if (updates[f.key] !== undefined && String(updates[f.key]) !== String(existing[f.key])) {
            changeLogs.push({
              id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              medicationId: id,
              medicationName: updates.name ?? existing.name,
              field: f.label,
              previousValue: String(existing[f.key] ?? ''),
              newValue: String(updates[f.key] ?? ''),
              changedByName: currentMember.name,
              changedByRole: currentMember.role,
              changedAt: nowIso,
            });
          }
        }

        const next: ElderShieldState = {
          ...prev,
          medications: prev.medications.map((m) =>
            m.id === id ? { ...m, ...updates, updatedAt: nowIso } : m
          ),
          medicationChangeLogs: [...changeLogs, ...prev.medicationChangeLogs],
          auditEvents: [...prev.auditEvents],
        };

        appendAudit(
          next,
          'medication.updated',
          `Updated ${existing.name} (${changeLogs.length} field change(s) logged).`,
          'medication',
          id
        );
        notify('success', `Updated ${updates.name ?? existing.name} with audit history.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  const removeMedication = useCallback(
    (id: string) => {
      if (!hasPermission(currentMember, 'manage_medications')) {
        notify('error', 'Your role cannot remove medication entries.');
        return;
      }
      setState((prev) => {
        const target = prev.medications.find((m) => m.id === id);
        if (!target) return prev;
        const next: ElderShieldState = {
          ...prev,
          medications: prev.medications.filter((m) => m.id !== id),
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'medication.removed',
          `Removed medication schedule: ${target.name}.`,
          'medication',
          id
        );
        notify('info', `Removed ${target.name} from active schedules.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  // Appointments CRUD + Reschedule Reminder Replacement
  const addAppointment = useCallback(
    (input: Omit<Appointment, 'id' | 'updatedByName' | 'updatedAt'>) => {
      if (!hasPermission(currentMember, 'manage_appointments')) {
        notify('error', 'Your role cannot schedule appointments.');
        return;
      }
      setState((prev) => {
        const id = `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const nowIso = new Date().toISOString();
        const appt: Appointment = {
          ...input,
          id,
          updatedByName: currentMember.name,
          updatedAt: nowIso,
        };
        const next: ElderShieldState = {
          ...prev,
          appointments: [...prev.appointments, appt],
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'appointment.created',
          `Added appointment with ${appt.doctorName} on ${appt.date} at ${appt.time}.`,
          'appointment',
          id
        );
        notify('success', `Appointment with ${appt.doctorName} added.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  const updateAppointment = useCallback(
    (id: string, updates: Partial<Appointment>) => {
      if (!hasPermission(currentMember, 'manage_appointments')) {
        notify('error', 'Your role cannot edit appointments.');
        return;
      }
      setState((prev) => {
        const existing = prev.appointments.find((a) => a.id === id);
        if (!existing) return prev;
        const nowIso = new Date().toISOString();
        const dateChanged =
          (updates.date && updates.date !== existing.date) ||
          (updates.time && updates.time !== existing.time);
        const nextStatus =
          updates.status ?? (dateChanged && existing.status === 'upcoming' ? 'rescheduled' : existing.status);

        // Cancel obsolete queued reminders when rescheduled or cancelled
        const updatedOutbox =
          dateChanged || nextStatus === 'cancelled'
            ? prev.notificationOutbox.map((item) =>
                item.relatedEntityId === id && item.status === 'queued'
                  ? {
                      ...item,
                      status: 'cancelled' as const,
                      errorMessage: 'Obsolete reminder cancelled after appointment update.',
                    }
                  : item
              )
            : prev.notificationOutbox;

        const next: ElderShieldState = {
          ...prev,
          appointments: prev.appointments.map((a) =>
            a.id === id
              ? { ...a, ...updates, status: nextStatus, updatedByName: currentMember.name, updatedAt: nowIso }
              : a
          ),
          notificationOutbox: updatedOutbox,
          auditEvents: [...prev.auditEvents],
        };

        appendAudit(
          next,
          `appointment.${nextStatus}`,
          `Updated ${existing.doctorName} appointment (${nextStatus}: ${updates.date ?? existing.date} ${updates.time ?? existing.time}).`,
          'appointment',
          id
        );
        notify('success', `Updated appointment with ${existing.doctorName}.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  // Caregiver Notes & Handover (preserves previous notes)
  const addCaregiverNote = useCallback(
    (input: Pick<CaregiverNote, 'category' | 'completedSummary' | 'attentionNeeded' | 'noteText'>) => {
      if (!hasPermission(currentMember, 'add_care_notes')) {
        notify('error', 'Your role does not permit adding care notes.');
        return;
      }
      setState((prev) => {
        const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const nowIso = new Date().toISOString();
        const newNote: CaregiverNote = {
          id,
          ...input,
          authorId: currentMember.id,
          authorName: currentMember.name,
          authorRole: currentMember.role,
          createdAt: nowIso,
          acknowledgedBy: null,
          acknowledgedAt: null,
        };
        const next: ElderShieldState = {
          ...prev,
          caregiverNotes: [newNote, ...prev.caregiverNotes],
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          `care_note.${input.category}`,
          `${currentMember.name} added a ${input.category.replace('_', ' ')} note.`,
          'caregiver_note',
          id
        );
        notify('success', 'Care note recorded and shared with authorized members.');
        return next;
      });
    },
    [currentMember, notify]
  );

  const acknowledgeCareNote = useCallback(
    (noteId: string) => {
      if (!hasPermission(currentMember, 'acknowledge_alerts')) {
        notify('error', 'Your role cannot acknowledge alerts or handovers.');
        return;
      }
      setState((prev) => {
        const next: ElderShieldState = {
          ...prev,
          caregiverNotes: prev.caregiverNotes.map((n) =>
            n.id === noteId
              ? { ...n, acknowledgedBy: currentMember.name, acknowledgedAt: new Date().toISOString() }
              : n
          ),
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'handover.acknowledged',
          `${currentMember.name} acknowledged handover note.`,
          'caregiver_note',
          noteId
        );
        return next;
      });
    },
    [currentMember, notify]
  );

  const acknowledgeDecision = useCallback(
    (decisionId: string) => {
      if (!hasPermission(currentMember, 'acknowledge_alerts')) {
        notify('error', 'Your role cannot acknowledge CareSense decisions.');
        return;
      }
      setState((prev) => {
        if (prev.acknowledgedDecisionIds.includes(decisionId)) return prev;
        const next: ElderShieldState = {
          ...prev,
          acknowledgedDecisionIds: [...prev.acknowledgedDecisionIds, decisionId],
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'caresense.acknowledged',
          `${currentMember.name} acknowledged CareSense alert (${decisionId}).`,
          'caresense',
          decisionId
        );
        return next;
      });
    },
    [currentMember, notify]
  );

  // Member permissions & revocation
  const updateMemberPermissions = useCallback(
    (memberId: string, permissions: PermissionKey[]) => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may update member permissions.');
        return;
      }
      setState((prev) => {
        const target = prev.members.find((m) => m.id === memberId);
        if (!target || target.role === 'elderly_owner') return prev;
        const next: ElderShieldState = {
          ...prev,
          members: prev.members.map((m) => (m.id === memberId ? { ...m, permissions } : m)),
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'member.permissions_updated',
          `Updated permissions for ${target.name} (${permissions.length} scope(s) enabled).`,
          'member',
          memberId
        );
        notify('success', `Saved access permissions for ${target.name}.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  const revokeMemberAccess = useCallback(
    (memberId: string) => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may revoke member access.');
        return;
      }
      setState((prev) => {
        const target = prev.members.find((m) => m.id === memberId);
        if (!target || target.role === 'elderly_owner') return prev;
        const next: ElderShieldState = {
          ...prev,
          members: prev.members.map((m) => (m.id === memberId ? { ...m, active: false } : m)),
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'member.revoked',
          `Revoked access for ${target.name} (${target.role}).`,
          'member',
          memberId
        );
        notify('info', `Access revoked for ${target.name}.`);
        return next;
      });
    },
    [currentMember, notify]
  );

  const updateHealthVaultCategoryVisibility = useCallback(
    (
      memberId: string,
      category: keyof Member['canViewHealthVaultCategories'],
      allowed: boolean
    ) => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may modify HealthVault consent.');
        return;
      }
      setState((prev) => {
        const target = prev.members.find((m) => m.id === memberId);
        if (!target || target.role === 'elderly_owner') return prev;
        const next: ElderShieldState = {
          ...prev,
          members: prev.members.map((m) =>
            m.id === memberId
              ? {
                  ...m,
                  canViewHealthVaultCategories: {
                    ...m.canViewHealthVaultCategories,
                    [category]: allowed,
                  },
                }
              : m
          ),
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'healthvault.consent_updated',
          `Set ${category} visibility to ${allowed ? 'allowed' : 'restricted'} for ${target.name}.`,
          'healthvault',
          memberId
        );
        return next;
      });
    },
    [currentMember, notify]
  );

  // Server-backed Passcode Invitation Creation & Redemption
  const createInvitation = useCallback(
    async (input: {
      label: string;
      recipientEmailHint: string;
      role: Exclude<Role, 'elderly_owner'>;
      permissions: PermissionKey[];
      expiresInDays: number;
    }): Promise<{ oneTimePasscode: string; invitation: Invitation } | null> => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may create invitation passcodes.');
        return null;
      }

      try {
        const res = await fetch('/api/invitations/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actorRole: currentMember.role,
            actorName: currentMember.name,
            ...input,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify('error', data.error || 'Could not create invitation.');
          return null;
        }
        setState((prev) => {
          const next: ElderShieldState = {
            ...prev,
            invitations: [data.invitation, ...prev.invitations],
            auditEvents: [...prev.auditEvents],
          };
          appendAudit(
            next,
            'invitation.created',
            `Created expiring passcode ${data.invitation.codeMasked} for ${input.role}.`,
            'invitation',
            data.invitation.id
          );
          return next;
        });
        notify('success', 'Passcode generated and stored securely as an HMAC-SHA256 hash.');
        return { oneTimePasscode: data.oneTimePasscode, invitation: data.invitation };
      } catch {
        notify('error', 'Backend server unreachable to verify invitation creation.');
        return null;
      }
    },
    [currentMember, notify]
  );

  const redeemInvitationPasscode = useCallback(
    async (input: {
      passcode: string;
      memberName: string;
      memberEmail: string;
      relationship: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/invitations/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || 'Passcode verification failed.' };
        }
        const joinedMember = data.member as Member;
        const updatedInv = data.invitation as Invitation;

        setState((prev) => {
          const next: ElderShieldState = {
            ...prev,
            members: [...prev.members, joinedMember],
            invitations: prev.invitations.some((i) => i.id === updatedInv.id)
              ? prev.invitations.map((i) => (i.id === updatedInv.id ? updatedInv : i))
              : [updatedInv, ...prev.invitations],
            notificationPreferences: [
              ...prev.notificationPreferences,
              {
                memberId: joinedMember.id,
                emailEnabled: true,
                upcomingMedication: true,
                unconfirmedMedication: true,
                upcomingAppointment: true,
                appointmentRescheduled: true,
                caregiverFollowUp: true,
                quietHoursStart: '22:00',
                quietHoursEnd: '07:00',
              },
            ],
            auditEvents: [...prev.auditEvents],
          };
          appendAudit(
            next,
            'invitation.redeemed',
            `${joinedMember.name} joined as ${joinedMember.role} using verified passcode.`,
            'invitation',
            updatedInv.id
          );
          return next;
        });
        setActiveMemberId(joinedMember.id);
        notify('success', `Welcome ${joinedMember.name}. Passcode verified and access granted.`);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Unable to reach passcode verification endpoint.' };
      }
    },
    [notify]
  );

  const revokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may revoke invitations.');
        return;
      }
      try {
        const res = await fetch('/api/invitations/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorRole: currentMember.role, invitationId }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify('error', data.error || 'Could not revoke invitation.');
          return;
        }
        setState((prev) => {
          const next: ElderShieldState = {
            ...prev,
            invitations: prev.invitations.map((inv) =>
              inv.id === invitationId ? data.invitation : inv
            ),
            auditEvents: [...prev.auditEvents],
          };
          appendAudit(
            next,
            'invitation.revoked',
            `Revoked invitation ${data.invitation.codeMasked}.`,
            'invitation',
            invitationId
          );
          return next;
        });
        notify('info', 'Invitation passcode revoked.');
      } catch {
        notify('error', 'Failed to revoke invitation on server.');
      }
    },
    [currentMember, notify]
  );

  // Notification Preferences & Outbox Processing
  const updateNotificationPreference = useCallback(
    (memberId: string, updates: Partial<NotificationPreference>) => {
      if (memberId !== currentMember.id && !hasPermission(currentMember, 'manage_notifications')) {
        notify('error', 'You do not have permission to edit another member’s preferences.');
        return;
      }
      setState((prev) => ({
        ...prev,
        notificationPreferences: prev.notificationPreferences.map((p) =>
          p.memberId === memberId ? { ...p, ...updates } : p
        ),
      }));
      notify('success', 'Notification preference saved.');
    },
    [currentMember, notify]
  );

  const syncAndProcessOutbox = useCallback(async () => {
    const mode = capabilities.emailProviderConfigured ? 'resend_live' : 'demo_simulation';
    const { added, skippedDuplicates } = queueNotificationsFromDecisions(state, decisions, mode);
    const combinedOutbox = [...added, ...state.notificationOutbox];

    try {
      const res = await fetch('/api/notifications/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: combinedOutbox }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', 'Notification processor failed.');
        return;
      }
      setState((prev) => {
        const next: ElderShieldState = {
          ...prev,
          notificationOutbox: data.processed,
          auditEvents: [...prev.auditEvents],
        };
        appendAudit(
          next,
          'notifications.processed',
          `Processed notification outbox (${added.length} new, ${skippedDuplicates} duplicate(s) prevented; mode: ${data.deliveryMode}).`,
          'notification_outbox',
          'batch'
        );
        return next;
      });
      notify(data.realEmailDispatched ? 'success' : 'info', data.notice);
    } catch {
      notify('error', 'Could not reach server notification processor.');
    }
  }, [capabilities.emailProviderConfigured, decisions, notify, state]);

  const sendTestNotification = useCallback(
    async (category: NotificationCategory, recipientMemberId: string) => {
      const recipient = state.members.find((m) => m.id === recipientMemberId);
      if (!recipient) return;
      const copy = buildPrivacySafeEmailCopy(category);
      const mode = capabilities.emailProviderConfigured ? 'resend_live' : 'demo_simulation';
      const testItem = {
        id: `notif_test_${Date.now()}`,
        deduplicationKey: `test_${category}_${recipient.id}_${Date.now()}`,
        recipientMemberId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        category,
        subject: `[TEST] ${copy.subject}`,
        bodyPreview: copy.bodyPreview,
        relatedEntityType: 'system_test' as const,
        relatedEntityId: 'demo_test',
        scheduledFor: new Date().toISOString(),
        status: 'queued' as const,
        attemptCount: 0,
        lastAttemptAt: null,
        errorMessage: null,
        deliveryMode: mode as 'demo_simulation' | 'resend_live',
      };

      try {
        const res = await fetch('/api/notifications/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [testItem] }),
        });
        const data = await res.json();
        const processedItem = data.processed?.[0] ?? {
          ...testItem,
          status: 'simulated_sent',
          attemptCount: 1,
          lastAttemptAt: new Date().toISOString(),
        };
        setState((prev) => ({
          ...prev,
          notificationOutbox: [processedItem, ...prev.notificationOutbox],
        }));
        notify(data.realEmailDispatched ? 'success' : 'info', data.notice);
      } catch {
        notify('error', 'Failed to run test notification.');
      }
    },
    [capabilities.emailProviderConfigured, notify, state.members]
  );

  // Emergency Contacts & Profile Updates
  const addEmergencyContact = useCallback(
    (contact: Omit<EmergencyContact, 'id'>) => {
      if (!hasPermission(currentMember, 'manage_members')) {
        notify('error', 'Only the Elderly Profile Owner may update emergency contacts.');
        return;
      }
      setState((prev) => ({
        ...prev,
        emergencyContacts: [
          ...prev.emergencyContacts,
          { ...contact, id: `ec_${Date.now()}` },
        ],
      }));
      notify('success', `Added emergency contact: ${contact.name}.`);
    },
    [currentMember, notify]
  );

  // Demo Laboratory Instant Scenarios
  const triggerDemoScenario = useCallback(
    (
      scenario:
        | 'upcoming_med'
        | 'due_med'
        | 'overdue_med'
        | 'repeated_unconfirmed'
        | 'upcoming_appt'
        | 'rescheduled_appt'
        | 'caregiver_handover'
        | 'generate_notifications'
    ) => {
      setState((prev) => {
        const baseNow = new Date();
        const todayKey = formatDateKey(baseNow);
        const setClock = (hh: number, mm: number) => {
          const d = new Date(baseNow.getTime());
          d.setHours(hh, mm, 0, 0);
          return d.toISOString();
        };

        if (scenario === 'upcoming_med') {
          // 07:35 AM -> 25 mins before 08:00 Lisinopril
          const next = {
            ...prev,
            simulatedNowIso: setClock(7, 35),
            medicationEvents: prev.medicationEvents.filter((e) => e.dateKey !== todayKey),
          };
          notify('info', 'Demo Lab: Simulated clock set to 07:35 (25m before 08:00 dose).');
          return next;
        }
        if (scenario === 'due_med') {
          // 08:10 AM -> 10 mins past 08:00 (within 30m window)
          const next = {
            ...prev,
            simulatedNowIso: setClock(8, 10),
            medicationEvents: prev.medicationEvents.filter((e) => e.dateKey !== todayKey),
          };
          notify('info', 'Demo Lab: Simulated clock set to 08:10 (Due — not yet confirmed).');
          return next;
        }
        if (scenario === 'overdue_med') {
          // 09:05 AM -> 65 mins past 08:00 (past 30m window)
          const next = {
            ...prev,
            simulatedNowIso: setClock(9, 5),
            medicationEvents: prev.medicationEvents.filter((e) => e.dateKey !== todayKey),
          };
          notify('info', 'Demo Lab: Simulated clock set to 09:05 (Not yet confirmed past reminder window).');
          return next;
        }
        if (scenario === 'repeated_unconfirmed') {
          // Remove recent events for Metformin ER so last 7 days show repeated unconfirmed
          const next = {
            ...prev,
            simulatedNowIso: setClock(19, 15),
            medicationEvents: prev.medicationEvents.filter(
              (e) => e.medicationId !== 'med_metformin_demo'
            ),
          };
          notify('info', 'Demo Lab: Cleared recent Metformin ER confirmations to demonstrate 7-day pattern review.');
          return next;
        }
        if (scenario === 'upcoming_appt') {
          const tomorrow = formatDateKey(addDays(baseNow, 1));
          const next = {
            ...prev,
            appointments: prev.appointments.map((a, idx) =>
              idx === 0 ? { ...a, date: tomorrow, time: '10:30', status: 'upcoming' as const } : a
            ),
          };
          notify('info', 'Demo Lab: Primary clinic appointment moved inside 36-hour reminder window.');
          return next;
        }
        if (scenario === 'rescheduled_appt') {
          const inFourDays = formatDateKey(addDays(baseNow, 4));
          const target = prev.appointments[0];
          const next = {
            ...prev,
            appointments: prev.appointments.map((a, idx) =>
              idx === 0
                ? {
                    ...a,
                    date: inFourDays,
                    time: '15:00',
                    status: 'rescheduled' as const,
                    updatedByName: 'Claire Pendelton (Demo Lab)',
                    updatedAt: baseNow.toISOString(),
                  }
                : a
            ),
            notificationOutbox: prev.notificationOutbox.map((o) =>
              o.relatedEntityId === target?.id && o.status === 'queued'
                ? { ...o, status: 'cancelled' as const, errorMessage: 'Cancelled by reschedule.' }
                : o
            ),
          };
          notify('info', 'Demo Lab: Appointment rescheduled; obsolete pending reminders cancelled.');
          return next;
        }
        if (scenario === 'caregiver_handover') {
          const noteId = `note_lab_${Date.now()}`;
          const next: ElderShieldState = {
            ...prev,
            caregiverNotes: [
              {
                id: noteId,
                category: 'handover',
                completedSummary: 'Morning hydration check completed; breakfast tray cleared.',
                attentionNeeded: 'Evening caregiver: please double-check Metformin ER reminder at 18:00.',
                noteText: 'Simulated handover generated by Demo Laboratory.',
                authorId: 'member_caretaker_sam',
                authorName: 'Samuel Okafor',
                authorRole: 'caretaker',
                createdAt: baseNow.toISOString(),
                acknowledgedBy: null,
                acknowledgedAt: null,
              },
              ...prev.caregiverNotes,
            ],
          };
          notify('info', 'Demo Lab: New unacknowledged caregiver handover added.');
          return next;
        }
        return prev;
      });
    },
    [notify]
  );

  const resetDemoState = useCallback(() => {
    clearElderShieldState();
    const fresh = createDemoSeedState();
    setState(fresh);
    setActiveMemberId('member_owner_arthur');
    notify('info', 'Demo Laboratory reset to initial fictional baseline.');
  }, [notify]);

  const clearSimulatedClock = useCallback(() => {
    setState((prev) => ({ ...prev, simulatedNowIso: null }));
    notify('info', 'Returned CareSense clock to live browser time.');
  }, [notify]);

  return {
    state,
    currentMember,
    activeMemberId,
    setActiveMemberId,
    effectiveNow,
    decisions,
    capabilities,
    storageWarning,
    bannerMessage,
    clearBanner: () => setBannerMessage(null),
    recordMedicationEvent,
    addMedication,
    updateMedication,
    removeMedication,
    addAppointment,
    updateAppointment,
    addCaregiverNote,
    acknowledgeCareNote,
    acknowledgeDecision,
    updateMemberPermissions,
    revokeMemberAccess,
    updateHealthVaultCategoryVisibility,
    createInvitation,
    redeemInvitationPasscode,
    revokeInvitation,
    updateNotificationPreference,
    syncAndProcessOutbox,
    sendTestNotification,
    addEmergencyContact,
    triggerDemoScenario,
    resetDemoState,
    clearSimulatedClock,
  };
}

export { DEFAULT_ROLE_PERMISSIONS };
