import type {
  CareSenseDecision,
  CareSenseRecipientDecision,
  ElderShieldState,
  Medication,
  MedicationComputedStatus,
  Member,
  NotificationCategory,
  NotificationPreference,
} from '../types/eldershield';
import { hasPermission } from './permissions';

export function getEffectiveNow(state: ElderShieldState): Date {
  if (state.simulatedNowIso) {
    const parsed = new Date(state.simulatedNowIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseTimeToday(date: Date, timeStr: string): Date {
  const [hh, mm] = timeStr.split(':').map((v) => Number.parseInt(v, 10));
  const result = new Date(date.getTime());
  result.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return result;
}

export function isMedicationScheduledOnDate(med: Medication, date: Date): boolean {
  if (!med.active) return false;
  const dateKey = toDateKey(date);
  if (med.startDate && dateKey < med.startDate) return false;
  if (med.endDate && dateKey > med.endDate) return false;
  if (med.frequency === 'specific_days') {
    return med.selectedDays.includes(date.getDay());
  }
  return true;
}

export function getMedicationStatusForDate(
  med: Medication,
  state: ElderShieldState,
  date: Date,
  referenceNow: Date
): { status: MedicationComputedStatus; event?: ElderShieldState['medicationEvents'][number]; minutesDelta: number } {
  const dateKey = toDateKey(date);
  const dedupKey = `${med.id}_${dateKey}_${med.scheduledTime}`;
  const event = state.medicationEvents.find((e) => e.deduplicationKey === dedupKey);

  const scheduledAt = parseTimeToday(date, med.scheduledTime);
  const minutesDelta = Math.round((referenceNow.getTime() - scheduledAt.getTime()) / 60000);

  if (event) {
    return { status: event.status, event, minutesDelta };
  }

  // If evaluating a past day without an event, it is unconfirmed
  const todayKey = toDateKey(referenceNow);
  if (dateKey < todayKey) {
    return { status: 'unconfirmed', minutesDelta };
  }
  if (dateKey > todayKey) {
    return { status: 'upcoming', minutesDelta };
  }

  if (minutesDelta < 0) {
    return { status: 'upcoming', minutesDelta };
  }
  if (minutesDelta <= med.reminderWindowMinutes) {
    return { status: 'due', minutesDelta };
  }
  return { status: 'unconfirmed', minutesDelta };
}

export function isWithinQuietHours(pref: NotificationPreference, now: Date): boolean {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(pref.quietHoursStart);
  const end = toMinutes(pref.quietHoursEnd);
  if (start === end) return false;
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight quiet hours (e.g. 22:00 to 07:00)
  return current >= start || current < end;
}

export function evaluateRecipientsForCategory(
  state: ElderShieldState,
  category: NotificationCategory,
  now: Date
): CareSenseRecipientDecision[] {
  return state.members
    .filter((m) => m.active)
    .map((member: Member) => {
      const pref = state.notificationPreferences.find((p) => p.memberId === member.id);

      // Permission check first (Scenario J)
      const hasRelevantViewPermission =
        category === 'upcoming_appointment' || category === 'appointment_rescheduled'
          ? hasPermission(member, 'view_appointments')
          : category === 'caregiver_follow_up'
          ? hasPermission(member, 'acknowledge_alerts') || hasPermission(member, 'add_care_notes')
          : hasPermission(member, 'record_medication_status') || hasPermission(member, 'view_profile');

      if (!hasRelevantViewPermission) {
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          notified: false,
          reason: 'Excluded: role permissions do not include this healthcare category.',
        };
      }

      if (!pref || !pref.emailEnabled) {
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          notified: false,
          reason: 'Excluded: email notifications disabled in member preferences.',
        };
      }

      const categoryEnabled =
        (category === 'upcoming_medication' && pref.upcomingMedication) ||
        (category === 'unconfirmed_medication' && pref.unconfirmedMedication) ||
        (category === 'upcoming_appointment' && pref.upcomingAppointment) ||
        (category === 'appointment_rescheduled' && pref.appointmentRescheduled) ||
        (category === 'caregiver_follow_up' && pref.caregiverFollowUp);

      if (!categoryEnabled) {
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          notified: false,
          reason: `Excluded: opted out of "${category.replace(/_/g, ' ')}" alerts.`,
        };
      }

      if (isWithinQuietHours(pref, now)) {
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          notified: false,
          reason: `Suppressed during member quiet hours (${pref.quietHoursStart}–${pref.quietHoursEnd}).`,
        };
      }

      return {
        memberId: member.id,
        name: member.name,
        role: member.role,
        notified: true,
        reason: 'Eligible: permitted role, opted-in preference, outside quiet hours.',
      };
    });
}

export function calculateAdherenceSummary(state: ElderShieldState, referenceNow: Date) {
  const daysToCheck = 7;
  let scheduledCount = 0;
  let takenCount = 0;
  let skippedCount = 0;
  let unconfirmedCount = 0;

  for (let offset = 0; offset < daysToCheck; offset++) {
    const day = new Date(referenceNow.getTime());
    day.setDate(day.getDate() - offset);
    for (const med of state.medications) {
      if (!isMedicationScheduledOnDate(med, day)) continue;
      const { status } = getMedicationStatusForDate(med, state, day, referenceNow);
      if (offset === 0 && (status === 'upcoming' || status === 'due')) {
        continue; // Future or currently due today isn't counted as past unconfirmed
      }
      scheduledCount++;
      if (status === 'taken') takenCount++;
      else if (status === 'skipped') skippedCount++;
      else if (status === 'unconfirmed') unconfirmedCount++;
    }
  }

  const adherencePercent =
    scheduledCount > 0 ? Math.round((takenCount / scheduledCount) * 100) : 100;

  return {
    daysEvaluated: daysToCheck,
    scheduledCount,
    takenCount,
    skippedCount,
    unconfirmedCount,
    adherencePercent,
  };
}

/**
 * CareSense Deterministic & Explainable Decision Engine
 * Covers all 10 required scenarios (A through J) dynamically based on current state & time.
 */
export function runCareSenseEngine(state: ElderShieldState): CareSenseDecision[] {
  const now = getEffectiveNow(state);
  const todayKey = toDateKey(now);
  const ackSet = new Set(state.acknowledgedDecisionIds);
  const decisions: CareSenseDecision[] = [];

  const todaysScheduledMeds = state.medications.filter((m) => isMedicationScheduledOnDate(m, now));

  let takenTodayCount = 0;
  const takenMedNames: string[] = [];

  for (const med of todaysScheduledMeds) {
    const { status, event, minutesDelta } = getMedicationStatusForDate(med, state, now, now);

    // Scenario A: Upcoming Medication (within 45 mins before scheduled time)
    if (status === 'upcoming' && minutesDelta >= -45 && minutesDelta < 0) {
      const id = `cs_upcoming_${med.id}_${todayKey}`;
      const recipients = evaluateRecipientsForCategory(state, 'upcoming_medication', now);
      decisions.push({
        id,
        scenarioCode: 'A_UPCOMING_MED',
        title: `Upcoming dose: ${med.name} at ${med.scheduledTime}`,
        severity: 'info',
        whatHappened: `${med.name} is scheduled in ${Math.abs(minutesDelta)} minute(s) at ${med.scheduledTime}.`,
        whyDetected: `Current time (${now.toTimeString().slice(0, 5)}) is within the 45-minute pre-dose window and no confirmation event exists for ${todayKey}.`,
        relevantRecords: [
          `Medication: ${med.name}`,
          `Instructions: ${med.instructions}`,
          `Scheduled: ${todayKey} at ${med.scheduledTime}`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: `Keep ${med.name} accessible and confirm once taken. Instructions: ${med.instructions}`,
        suggestedNotificationCategory: 'upcoming_medication',
        relatedEntityType: 'medication',
        relatedEntityId: med.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }

    // Scenario B: Due Medication (0 to reminderWindowMinutes past scheduled time)
    if (status === 'due') {
      const id = `cs_due_${med.id}_${todayKey}`;
      const recipients = evaluateRecipientsForCategory(state, 'upcoming_medication', now);
      decisions.push({
        id,
        scenarioCode: 'B_DUE_MED',
        title: `Due now: ${med.name} (${med.scheduledTime})`,
        severity: 'attention',
        whatHappened: `${med.name} reached its scheduled time (${med.scheduledTime}) ${minutesDelta} minute(s) ago and is not yet confirmed.`,
        whyDetected: `Elapsed time (${minutesDelta}m) is inside the ${med.reminderWindowMinutes}-minute confirmation window without a recorded Taken or Skipped entry.`,
        relevantRecords: [
          `Medication: ${med.name}`,
          `Confirmation window: ${med.reminderWindowMinutes} minutes`,
          `Status: Due — not yet confirmed (not assumed missed)`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: `Prompt ${state.profile.preferredName} to confirm whether ${med.name} was taken, or record status if assisted.`,
        suggestedNotificationCategory: 'upcoming_medication',
        relatedEntityType: 'medication',
        relatedEntityId: med.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }

    // Scenario C: Overdue / Unconfirmed Medication (past reminderWindowMinutes)
    if (status === 'unconfirmed') {
      const id = `cs_overdue_${med.id}_${todayKey}`;
      const recipients = evaluateRecipientsForCategory(state, 'unconfirmed_medication', now);
      decisions.push({
        id,
        scenarioCode: 'C_OVERDUE_MED',
        title: `Not yet confirmed: ${med.name} (${med.scheduledTime})`,
        severity: 'urgent',
        whatHappened: `${med.name} scheduled for ${med.scheduledTime} remains not yet confirmed ${minutesDelta} minutes after the scheduled time.`,
        whyDetected: `Elapsed time (${minutesDelta}m) exceeded the configured ${med.reminderWindowMinutes}-minute reminder window with no confirmation event for ${todayKey}.`,
        relevantRecords: [
          `Medication: ${med.name}`,
          `Scheduled: ${todayKey} ${med.scheduledTime}`,
          `Elapsed: ${minutesDelta} minutes past schedule`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: `Check in gently with ${state.profile.preferredName} to verify whether the entry was already taken and simply unlogged. Never advise taking an extra dose.`,
        suggestedNotificationCategory: 'unconfirmed_medication',
        relatedEntityType: 'medication',
        relatedEntityId: med.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }

    // Scenario D: Medication Marked Taken
    if (status === 'taken' && event) {
      takenTodayCount++;
      takenMedNames.push(`${med.name} (confirmed by ${event.recordedByName})`);
    }
  }

  if (takenTodayCount > 0) {
    const id = `cs_taken_summary_${todayKey}_${takenTodayCount}`;
    const adherence = calculateAdherenceSummary(state, now);
    decisions.push({
      id,
      scenarioCode: 'D_TAKEN',
      title: `${takenTodayCount} medication entry(s) confirmed today`,
      severity: 'info',
      whatHappened: `${takenTodayCount} of ${todaysScheduledMeds.length} scheduled medication entries for ${todayKey} are confirmed taken.`,
      whyDetected: `Confirmed medication_events recorded today; 7-day recorded adherence recalculated to ${adherence.adherencePercent}%.`,
      relevantRecords: takenMedNames,
      whoShouldBeInformed: state.members
        .filter((m) => m.active)
        .map((m) => ({
          memberId: m.id,
          name: m.name,
          role: m.role,
          notified: false,
          reason: 'Reflected on shared timeline; routine confirmations do not send alert emails.',
        })),
      appropriateAction: 'No intervention needed. Outstanding reminders recalculated automatically.',
      acknowledged: ackSet.has(id),
      generatedAt: now.toISOString(),
    });
  }

  // Scenario E: Medication Marked Skipped (within last 48h)
  const cutoff48h = now.getTime() - 48 * 3600 * 1000;
  const recentSkipped = state.medicationEvents.filter(
    (e) => e.status === 'skipped' && new Date(e.recordedAt).getTime() >= cutoff48h
  );
  for (const skipEvent of recentSkipped) {
    const med = state.medications.find((m) => m.id === skipEvent.medicationId);
    if (!med) continue;
    const id = `cs_skipped_${skipEvent.id}`;
    const recipients = evaluateRecipientsForCategory(state, 'caregiver_follow_up', now);
    decisions.push({
      id,
      scenarioCode: 'E_SKIPPED',
      title: `Skipped entry logged: ${med.name} (${skipEvent.dateKey})`,
      severity: 'attention',
      whatHappened: `${med.name} at ${skipEvent.scheduledTime} on ${skipEvent.dateKey} was marked skipped by ${skipEvent.recordedByName}.`,
      whyDetected: `A "skipped" medication event was logged within the last 48 hours${skipEvent.note ? ` with note: "${skipEvent.note}"` : ''}.`,
      relevantRecords: [
        `Medication: ${med.name}`,
        `Date: ${skipEvent.dateKey} ${skipEvent.scheduledTime}`,
        `Recorded by: ${skipEvent.recordedByName}`,
        ...(skipEvent.note ? [`Note: ${skipEvent.note}`] : []),
      ],
      whoShouldBeInformed: recipients,
      appropriateAction:
        'Review the skipped note with the care circle. Do NOT recommend taking an extra or double dose; contact the prescriber or pharmacist if guidance is needed.',
      suggestedNotificationCategory: 'caregiver_follow_up',
      relatedEntityType: 'medication',
      relatedEntityId: med.id,
      acknowledged: ackSet.has(id),
      generatedAt: now.toISOString(),
    });
  }

  // Scenario F: Repeated Unconfirmed or Skipped Entries across last 7 days
  const unconfirmedOrSkippedDatesByMed = new Map<string, { med: Medication; dates: string[] }>();
  for (let offset = 1; offset <= 7; offset++) {
    const day = new Date(now.getTime());
    day.setDate(day.getDate() - offset);
    const dayKey = toDateKey(day);
    for (const med of state.medications) {
      if (!isMedicationScheduledOnDate(med, day)) continue;
      const { status } = getMedicationStatusForDate(med, state, day, now);
      if (status === 'unconfirmed' || status === 'skipped') {
        const entry = unconfirmedOrSkippedDatesByMed.get(med.id) ?? { med, dates: [] };
        entry.dates.push(`${dayKey} (${status})`);
        unconfirmedOrSkippedDatesByMed.set(med.id, entry);
      }
    }
  }
  for (const { med, dates } of unconfirmedOrSkippedDatesByMed.values()) {
    if (dates.length >= 2) {
      const id = `cs_repeated_${med.id}_${todayKey}`;
      const recipients = evaluateRecipientsForCategory(state, 'unconfirmed_medication', now);
      decisions.push({
        id,
        scenarioCode: 'F_REPEATED_UNCONFIRMED',
        title: `Pattern review: ${dates.length} unconfirmed/skipped entries for ${med.name}`,
        severity: 'urgent',
        whatHappened: `${med.name} has ${dates.length} unconfirmed or skipped entries over the past 7 days.`,
        whyDetected: `Historical 7-day scan detected ${dates.length} non-confirmed scheduled slots (threshold >= 2).`,
        relevantRecords: [
          `Medication: ${med.name} (${med.scheduledTime})`,
          `Dates involved: ${dates.join(', ')}`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: `Suggest a supportive caregiver check-in with ${state.profile.preferredName} to see if the scheduled time (${med.scheduledTime}) or bottle placement can be made easier.`,
        suggestedNotificationCategory: 'unconfirmed_medication',
        relatedEntityType: 'medication',
        relatedEntityId: med.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }
  }

  // Scenario G & H: Upcoming & Rescheduled Appointments
  for (const appt of state.appointments) {
    if (appt.status === 'cancelled' || appt.status === 'completed') continue;

    const apptDateTime = new Date(`${appt.date}T${appt.time}:00`);
    const hoursUntil = (apptDateTime.getTime() - now.getTime()) / 3600000;

    if (appt.status === 'rescheduled') {
      const id = `cs_rescheduled_${appt.id}`;
      const recipients = evaluateRecipientsForCategory(state, 'appointment_rescheduled', now);
      decisions.push({
        id,
        scenarioCode: 'H_RESCHEDULED_APPT',
        title: `Rescheduled visit: ${appt.doctorName} (${appt.date})`,
        severity: 'attention',
        whatHappened: `Appointment with ${appt.doctorName} (${appt.specialty}) was rescheduled to ${appt.date} at ${appt.time}.`,
        whyDetected: `Appointment status is "rescheduled" (updated by ${appt.updatedByName}). Obsolete reminders are cancelled and new reminders align to ${appt.date}.`,
        relevantRecords: [
          `Doctor: ${appt.doctorName} · ${appt.specialty}`,
          `Clinic: ${appt.clinicName}, ${appt.location}`,
          `New schedule: ${appt.date} at ${appt.time}`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: 'Confirm transport and preparation notes with authorized family members.',
        suggestedNotificationCategory: 'appointment_rescheduled',
        relatedEntityType: 'appointment',
        relatedEntityId: appt.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }

    if (hoursUntil >= -1 && hoursUntil <= appt.reminderLeadHours) {
      const id = `cs_upcoming_appt_${appt.id}_${appt.date}`;
      const recipients = evaluateRecipientsForCategory(state, 'upcoming_appointment', now);
      const alreadyQueued = state.notificationOutbox.some(
        (n) =>
          n.relatedEntityId === appt.id &&
          n.category === 'upcoming_appointment' &&
          n.status !== 'cancelled'
      );
      decisions.push({
        id,
        scenarioCode: 'G_UPCOMING_APPT',
        title: `Upcoming appointment: ${appt.doctorName} on ${appt.date}`,
        severity: 'attention',
        whatHappened: `Appointment with ${appt.doctorName} at ${appt.clinicName} is in ${Math.max(0, Math.round(hoursUntil))} hour(s).`,
        whyDetected: `Hours until appointment (${hoursUntil.toFixed(1)}h) is within the ${appt.reminderLeadHours}-hour reminder lead window. Duplicate check: ${alreadyQueued ? 'reminder already queued/sent' : 'ready to queue'}.`,
        relevantRecords: [
          `Doctor: ${appt.doctorName} (${appt.specialty})`,
          `Location: ${appt.clinicName}, ${appt.location}`,
          `Prep notes: ${appt.preparationNotes || 'None recorded'}`,
        ],
        whoShouldBeInformed: recipients,
        appropriateAction: `Review preparation notes and confirm escort details before ${appt.date} ${appt.time}.`,
        suggestedNotificationCategory: 'upcoming_appointment',
        relatedEntityType: 'appointment',
        relatedEntityId: appt.id,
        acknowledged: ackSet.has(id),
        generatedAt: now.toISOString(),
      });
    }
  }

  // Scenario I: Caregiver Handover Notes unacknowledged
  const pendingHandovers = state.caregiverNotes.filter(
    (n) => n.category === 'handover' && !n.acknowledgedBy
  );
  for (const handover of pendingHandovers) {
    const id = `cs_handover_${handover.id}`;
    const recipients = evaluateRecipientsForCategory(state, 'caregiver_follow_up', now);
    decisions.push({
      id,
      scenarioCode: 'I_HANDOVER',
      title: `Shift handover from ${handover.authorName}`,
      severity: 'attention',
      whatHappened: `${handover.authorName} recorded a shift handover highlighting: "${handover.attentionNeeded}"`,
      whyDetected: `Handover note remains unacknowledged by the incoming care circle while preserving previous notes.`,
      relevantRecords: [
        `Completed: ${handover.completedSummary}`,
        `Needs attention: ${handover.attentionNeeded}`,
        `Author: ${handover.authorName} (${handover.authorRole})`,
      ],
      whoShouldBeInformed: recipients,
      appropriateAction: 'Review the handover items and mark acknowledged once picked up by the next caregiver or family member.',
      suggestedNotificationCategory: 'caregiver_follow_up',
      relatedEntityType: 'caregiver_note',
      relatedEntityId: handover.id,
      acknowledged: ackSet.has(id),
      generatedAt: now.toISOString(),
    });
  }

  // Scenario J: Explicit Notification Preference & Permission Audit summary
  const quietMembers = state.notificationPreferences.filter((p) => isWithinQuietHours(p, now));
  const prefAuditId = `cs_pref_audit_${todayKey}_${quietMembers.length}`;
  decisions.push({
    id: prefAuditId,
    scenarioCode: 'J_PREF_FILTER',
    title: 'Notification consent & permission filter active',
    severity: 'info',
    whatHappened: `CareSense filtered all alert recipients against role permissions, category opt-ins, and quiet hours (${quietMembers.length} member(s) currently in quiet hours).`,
    whyDetected: `Continuous rule enforcement prevents unauthorized disclosures and respects member quiet-hour boundaries.`,
    relevantRecords: state.members.map((m) => {
      const pref = state.notificationPreferences.find((p) => p.memberId === m.id);
      const quiet = pref ? isWithinQuietHours(pref, now) : false;
      return `${m.name} (${m.role}): email=${pref?.emailEnabled ? 'on' : 'off'}, quietHours=${quiet ? 'active' : 'open'}`;
    }),
    whoShouldBeInformed: [],
    appropriateAction: 'Adjust individual opt-ins or quiet hours anytime in NotifyCare.',
    acknowledged: true,
    generatedAt: now.toISOString(),
  });

  // Sort urgent -> attention -> info
  const order = { urgent: 0, attention: 1, info: 2 };
  decisions.sort((a, b) => order[a.severity] - order[b.severity]);
  return decisions;
}
