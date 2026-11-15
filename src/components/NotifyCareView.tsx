import { Mail, Play, Send } from 'lucide-react';
import { useState } from 'react';
import { buildPrivacySafeEmailCopy } from '../engine/notifications';
import { hasPermission, ROLE_LABELS } from '../engine/permissions';
import type { BackendCapabilities } from '../state/useElderShield';
import type {
  ElderShieldState,
  Member,
  NotificationCategory,
  NotificationPreference,
} from '../types/eldershield';
import { OutboxStatusText } from './StatusIndicator';

interface NotifyCareViewProps {
  state: ElderShieldState;
  currentMember: Member;
  capabilities: BackendCapabilities;
  onUpdatePreference: (memberId: string, updates: Partial<NotificationPreference>) => void;
  onSyncAndProcessOutbox: () => Promise<void>;
  onSendTestNotification: (category: NotificationCategory, recipientMemberId: string) => Promise<void>;
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  upcoming_medication: 'Upcoming Medication Dose',
  unconfirmed_medication: 'Unconfirmed Medication Follow-Up',
  upcoming_appointment: 'Upcoming Doctor Appointment',
  appointment_rescheduled: 'Appointment Rescheduled',
  caregiver_follow_up: 'Important Caregiver Follow-Up',
};

export function NotifyCareView({
  state,
  currentMember,
  capabilities,
  onUpdatePreference,
  onSyncAndProcessOutbox,
  onSendTestNotification,
}: NotifyCareViewProps) {
  const [testCategory, setTestCategory] = useState<NotificationCategory>('upcoming_medication');
  const [testRecipientId, setTestRecipientId] = useState<string>(currentMember.id);

  const canManageAll = hasPermission(currentMember, 'manage_notifications');
  const previewCopy = buildPrivacySafeEmailCopy(testCategory);

  return (
    <div className="space-y-8">
      {/* Honest Delivery Architecture Banner */}
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#202522]">
              NotifyCare — Email Reminders & Outbox Queue
            </h1>
            <p className="mt-1 text-base text-[#515853]">
              Server-side notification queue with deduplication keys, quiet hours, retry tracking, and privacy-safe subjects (medication names are omitted from email subject lines).
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncAndProcessOutbox}
            className="touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            <span>Process CareSense Queue</span>
          </button>
        </div>

        <div
          className={`rounded-lg border p-4 text-base ${
            capabilities.emailProviderConfigured
              ? 'border-[#344737] bg-[#E7ECE7] text-[#202522]'
              : 'border-[#654513]/40 bg-[#F6ECD9] text-[#202522]'
          }`}
        >
          {capabilities.emailProviderConfigured ? (
            <p>
              <strong>Live Email Provider Connected:</strong> Server-side Resend integration is configured. Processing the outbox dispatches real emails via <code className="font-mono-data">POST /api/notifications/process</code>.
            </p>
          ) : (
            <p>
              <strong>Local Demo Simulation Mode (No External Email Sent):</strong>{' '}
              <code className="font-mono-data">RESEND_API_KEY</code> is not configured in this environment. Outbox items are processed into <em>Simulated</em> delivery records with full email previews so you can verify deduplication, quiet hours, and retry states honestly without claiming an external email was sent.
            </p>
          )}
        </div>
      </section>

      {/* Test Notification & Privacy-Safe Email Preview */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
            <Send className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
            <span>Test Notification Workflow</span>
          </h2>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-base font-semibold text-[#202522]">Notification Category</span>
              <select
                value={testCategory}
                onChange={(e) => setTestCategory(e.target.value as NotificationCategory)}
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              >
                {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-base font-semibold text-[#202522]">Authorized Recipient</span>
              <select
                value={testRecipientId}
                onChange={(e) => setTestRecipientId(e.target.value)}
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              >
                {state.members
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({ROLE_LABELS[m.role]}) — {m.email}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => onSendTestNotification(testCategory, testRecipientId)}
            className="touch-target rounded-lg bg-[#202522] px-5 py-3 text-base font-bold text-white hover:bg-[#373E3A]"
          >
            {capabilities.emailProviderConfigured
              ? 'Dispatch Test Email via Resend'
              : 'Run Simulated Test Email'}
          </button>
        </div>

        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
            <Mail className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
            <span>Privacy-Safe Email Preview</span>
          </h2>
          <p className="text-sm text-[#515853]">
            Subject lines and previews intentionally withhold medication names and medical recommendations.
          </p>
          <div className="rounded-lg border border-[#DDD6C9] bg-white p-4 space-y-2">
            <p className="text-sm text-[#515853]">
              <strong>Subject:</strong> {previewCopy.subject}
            </p>
            <hr className="border-[#DDD6C9]" />
            <p className="text-base text-[#202522]">{previewCopy.bodyPreview}</p>
          </div>
        </div>
      </section>

      {/* Member Notification Control Centre */}
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-5">
        <h2 className="text-2xl font-bold text-[#202522]">Member Notification Preferences & Quiet Hours</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {state.members
            .filter((m) => m.active)
            .map((member) => {
              const pref = state.notificationPreferences.find((p) => p.memberId === member.id);
              if (!pref) return null;
              const canEditThis = canManageAll || member.id === currentMember.id;

              return (
                <article
                  key={member.id}
                  className="rounded-xl border border-[#DDD6C9] bg-white p-5 space-y-3"
                >
                  <div>
                    <h3 className="text-xl font-bold text-[#202522]">{member.name}</h3>
                    <p className="text-sm text-[#515853]">
                      {ROLE_LABELS[member.role]} · <span className="font-mono-data">{member.email}</span>
                    </p>
                  </div>

                  <label className="flex items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      checked={pref.emailEnabled}
                      disabled={!canEditThis}
                      onChange={(e) =>
                        onUpdatePreference(member.id, { emailEnabled: e.target.checked })
                      }
                      className="h-5 w-5 accent-[#B85E47]"
                    />
                    <span className="text-base font-bold text-[#202522]">Email Reminders Enabled</span>
                  </label>

                  <div className="space-y-2 border-t border-[#DDD6C9] pt-3 text-base">
                    {(
                      [
                        ['upcomingMedication', 'Upcoming medication'],
                        ['unconfirmedMedication', 'Unconfirmed medication'],
                        ['upcomingAppointment', 'Upcoming appointment'],
                        ['appointmentRescheduled', 'Appointment rescheduled'],
                        ['caregiverFollowUp', 'Caregiver follow-up'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={pref[field]}
                          disabled={!canEditThis || !pref.emailEnabled}
                          onChange={(e) =>
                            onUpdatePreference(member.id, { [field]: e.target.checked })
                          }
                          className="h-5 w-5 accent-[#B85E47]"
                        />
                        <span className="text-[#202522]">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-[#DDD6C9] pt-3">
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-[#515853]">Quiet Start</span>
                      <input
                        type="time"
                        value={pref.quietHoursStart}
                        disabled={!canEditThis}
                        onChange={(e) =>
                          onUpdatePreference(member.id, { quietHoursStart: e.target.value })
                        }
                        className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-[#515853]">Quiet End</span>
                      <input
                        type="time"
                        value={pref.quietHoursEnd}
                        disabled={!canEditThis}
                        onChange={(e) =>
                          onUpdatePreference(member.id, { quietHoursEnd: e.target.value })
                        }
                        className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                </article>
              );
            })}
        </div>
      </section>

      {/* Outbox Delivery Log */}
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
        <h2 className="text-2xl font-bold text-[#202522]">
          Notification Outbox ({state.notificationOutbox.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#DDD6C9] text-sm font-bold text-[#515853]">
                <th className="py-3 pr-4">Recipient</th>
                <th className="py-3 pr-4">Category & Subject</th>
                <th className="py-3 pr-4">Delivery Status</th>
                <th className="py-3 pr-4">Attempts</th>
                <th className="py-3">Deduplication Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD6C9] text-base">
              {state.notificationOutbox.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4">
                    <div className="font-bold text-[#202522]">{item.recipientName}</div>
                    <div className="font-mono-data text-sm text-[#515853]">{item.recipientEmail}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-[#202522]">{item.subject}</div>
                    <div className="text-sm text-[#515853]">{item.bodyPreview}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <OutboxStatusText status={item.status} />
                    {item.errorMessage && (
                      <div className="text-xs text-[#A94B45]">{item.errorMessage}</div>
                    )}
                  </td>
                  <td className="font-mono-data py-3 pr-4 text-[#202522]">{item.attemptCount}</td>
                  <td className="font-mono-data py-3 text-xs text-[#515853]">
                    {item.deduplicationKey}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
