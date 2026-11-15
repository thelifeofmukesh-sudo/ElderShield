import type {
  CareSenseDecision,
  ElderShieldState,
  NotificationCategory,
  NotificationOutboxItem,
} from '../types/eldershield';
import { getEffectiveNow, toDateKey } from './caresense';

/**
 * Generates privacy-safe email subjects and previews without exposing
 * sensitive medication names or medical conditions in subject lines.
 */
export function buildPrivacySafeEmailCopy(category: NotificationCategory): {
  subject: string;
  bodyPreview: string;
} {
  switch (category) {
    case 'upcoming_medication':
      return {
        subject: 'ElderShield Care Reminder: Scheduled routine approaching',
        bodyPreview:
          'Care reminder: A scheduled medication entry is approaching. Please review the ElderShield dashboard.',
      };
    case 'unconfirmed_medication':
      return {
        subject: 'ElderShield Care Follow-Up: Entry not yet confirmed',
        bodyPreview:
          'Care follow-up: A scheduled medication entry remains unconfirmed. Please check with the profile owner.',
      };
    case 'upcoming_appointment':
      return {
        subject: 'ElderShield Appointment Reminder: Upcoming visit approaching',
        bodyPreview:
          'Appointment reminder: An upcoming healthcare appointment is approaching. Review the shared schedule on ElderShield.',
      };
    case 'appointment_rescheduled':
      return {
        subject: 'ElderShield Schedule Update: Appointment time changed',
        bodyPreview:
          'Schedule update: An appointment on the shared ElderShield calendar has been rescheduled. Please review updated details.',
      };
    case 'caregiver_follow_up':
      return {
        subject: 'ElderShield Care Note: New follow-up item recorded',
        bodyPreview:
          'Care circle update: A caregiver or family member recorded a follow-up note for review on ElderShield.',
      };
  }
}

export function queueNotificationsFromDecisions(
  state: ElderShieldState,
  decisions: CareSenseDecision[],
  deliveryMode: 'demo_simulation' | 'resend_live'
): { added: NotificationOutboxItem[]; skippedDuplicates: number } {
  const now = getEffectiveNow(state);
  const todayKey = toDateKey(now);
  const existingKeys = new Set(
    state.notificationOutbox
      .filter((item) => item.status !== 'cancelled')
      .map((item) => item.deduplicationKey)
  );

  const added: NotificationOutboxItem[] = [];
  let skippedDuplicates = 0;

  for (const decision of decisions) {
    if (!decision.suggestedNotificationCategory || !decision.relatedEntityId) continue;
    if (decision.severity === 'info' && decision.scenarioCode !== 'A_UPCOMING_MED') continue;

    const category = decision.suggestedNotificationCategory;
    const copy = buildPrivacySafeEmailCopy(category);

    for (const recipient of decision.whoShouldBeInformed) {
      if (!recipient.notified) continue;
      const member = state.members.find((m) => m.id === recipient.memberId);
      if (!member) continue;

      const deduplicationKey = `${category}_${decision.relatedEntityId}_${todayKey}_${member.id}`;
      if (existingKeys.has(deduplicationKey)) {
        skippedDuplicates++;
        continue;
      }
      existingKeys.add(deduplicationKey);

      added.push({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        deduplicationKey,
        recipientMemberId: member.id,
        recipientName: member.name,
        recipientEmail: member.email,
        category,
        subject: copy.subject,
        bodyPreview: copy.bodyPreview,
        relatedEntityType: decision.relatedEntityType ?? 'medication',
        relatedEntityId: decision.relatedEntityId,
        scheduledFor: now.toISOString(),
        status: 'queued',
        attemptCount: 0,
        lastAttemptAt: null,
        errorMessage: null,
        deliveryMode,
      });
    }
  }

  return { added, skippedDuplicates };
}
