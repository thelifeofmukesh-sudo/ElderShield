import { Calendar, Check, Phone, ShieldAlert, SkipForward } from 'lucide-react';
import { getMedicationStatusForDate, isMedicationScheduledOnDate } from '../engine/caresense';
import { hasPermission } from '../engine/permissions';
import type { CareSenseDecision, ElderShieldState, Member } from '../types/eldershield';
import { MedStatusText } from './StatusIndicator';

interface SeniorSimpleViewProps {
  state: ElderShieldState;
  currentMember: Member;
  effectiveNow: Date;
  decisions: CareSenseDecision[];
  onRecordMedication: (medicationId: string, status: 'taken' | 'skipped', note?: string) => void;
  onAcknowledgeDecision: (id: string) => void;
  onOpenTab: (tab: 'meditrack' | 'appointments' | 'familyconnect' | 'healthvault') => void;
}

export function SeniorSimpleView({
  state,
  currentMember,
  effectiveNow,
  decisions,
  onRecordMedication,
  onAcknowledgeDecision,
  onOpenTab,
}: SeniorSimpleViewProps) {
  const todaysMeds = state.medications
    .filter((m) => isMedicationScheduledOnDate(m, effectiveNow))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const upcomingAppts = state.appointments
    .filter((a) => a.status === 'upcoming' || a.status === 'rescheduled')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  const activeAlerts = decisions.filter((d) => !d.acknowledged && d.severity !== 'info');
  const canRecord = hasPermission(currentMember, 'record_medication_status');

  const formattedDate = effectiveNow.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8">
      {/* Calm Greeting & Date Header */}
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 sm:p-8">
        <p className="font-mono-data text-base text-[#515853]">{formattedDate}</p>
        <h1 className="mt-2 text-3xl font-bold text-[#202522] sm:text-4xl">
          Good day, {state.profile.preferredName}
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-[#515853]">
          Here is your daily routine in large print. Confirm each medication when you take it, or review your next clinic visit below.
        </p>

        {activeAlerts.length > 0 && (
          <div className="mt-6 rounded-lg border border-[#A94B45]/40 bg-[#F6E6E5] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-lg font-bold text-[#7F2D28]">
                  Care Check-In ({activeAlerts.length})
                </p>
                <p className="mt-1 text-lg text-[#202522]">{activeAlerts[0].whatHappened}</p>
                <p className="mt-1 text-base text-[#515853]">{activeAlerts[0].appropriateAction}</p>
              </div>
              {hasPermission(currentMember, 'acknowledge_alerts') && (
                <button
                  type="button"
                  onClick={() => onAcknowledgeDecision(activeAlerts[0].id)}
                  className="touch-target shrink-0 rounded-lg border border-[#202522] bg-[#FAF8F3] px-5 py-3 text-base font-semibold text-[#202522] hover:bg-[#EFEAE0] whitespace-nowrap"
                >
                  Mark Reviewed
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Today's Medications — Large Print & >= 48px Controls */}
      <section aria-labelledby="simple-meds-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="simple-meds-heading" className="text-2xl font-bold text-[#202522] sm:text-3xl">
            Today’s Medications
          </h2>
          <button
            type="button"
            onClick={() => onOpenTab('meditrack')}
            className="touch-target rounded-lg px-3 py-2 text-base font-semibold text-[#9C4934] underline underline-offset-4 hover:text-[#202522]"
          >
            View full weekly schedule
          </button>
        </div>

        {todaysMeds.length === 0 ? (
          <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 text-lg text-[#515853]">
            No medications are scheduled for today.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {todaysMeds.map((med) => {
              const { status, event } = getMedicationStatusForDate(
                med,
                state,
                effectiveNow,
                effectiveNow
              );
              const isResolved = status === 'taken' || status === 'skipped';

              return (
                <article
                  key={med.id}
                  className="flex flex-col justify-between gap-5 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6"
                >
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono-data text-xl font-semibold text-[#202522]">
                        {med.scheduledTime}
                      </span>
                      <MedStatusText status={status} />
                    </div>
                    <h3 className="mt-2 text-[24px] font-bold leading-snug text-[#202522]">
                      {med.name}
                    </h3>
                    <p className="mt-2 text-lg text-[#515853]">{med.instructions}</p>
                    {event && (
                      <p className="mt-3 text-base text-[#515853]">
                        Recorded by {event.recordedByName} at{' '}
                        <span className="font-mono-data">
                          {new Date(event.recordedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    )}
                  </div>

                  {!isResolved && canRecord && (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => onRecordMedication(med.id, 'taken')}
                        className="touch-target flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3.5 text-lg font-bold text-white hover:bg-[#9C4934] es-transition"
                      >
                        <Check className="h-6 w-6 shrink-0" aria-hidden="true" />
                        <span>Mark Taken</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onRecordMedication(med.id, 'skipped', 'Skipped in Simple Mode')
                        }
                        className="touch-target flex items-center justify-center gap-2 rounded-lg border border-[#DDD6C9] bg-[#F4F0E7] px-5 py-3.5 text-lg font-semibold text-[#202522] hover:bg-[#EFEAE0] es-transition"
                      >
                        <SkipForward className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>Skip</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-Column Summary: Next Doctor Visit + Emergency Contacts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
              <Calendar className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
              <span>Next Doctor Visit</span>
            </h2>
            <button
              type="button"
              onClick={() => onOpenTab('appointments')}
              className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4"
            >
              All visits
            </button>
          </div>

          {upcomingAppts[0] ? (
            <div className="mt-4 space-y-2 text-lg">
              <p className="font-mono-data text-xl font-semibold text-[#202522]">
                {upcomingAppts[0].date} · {upcomingAppts[0].time}
              </p>
              <p className="text-xl font-bold text-[#202522]">{upcomingAppts[0].doctorName}</p>
              <p className="text-[#515853]">
                {upcomingAppts[0].specialty} · {upcomingAppts[0].clinicName}
              </p>
              <p className="text-base text-[#515853]">{upcomingAppts[0].location}</p>
              {upcomingAppts[0].preparationNotes && (
                <p className="mt-3 rounded-lg bg-[#F4F0E7] p-4 text-base text-[#202522]">
                  <strong>Preparation:</strong> {upcomingAppts[0].preparationNotes}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-lg text-[#515853]">No upcoming appointments scheduled.</p>
          )}
        </section>

        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
              <Phone className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
              <span>Emergency Contacts</span>
            </h2>
            <button
              type="button"
              onClick={() => onOpenTab('healthvault')}
              className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4"
            >
              HealthVault
            </button>
          </div>
          <ul className="mt-4 divide-y divide-[#DDD6C9]">
            {state.emergencyContacts.map((ec) => (
              <li key={ec.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-xl font-bold text-[#202522]">{ec.name}</p>
                <p className="text-base text-[#515853]">
                  {ec.relationship} ·{' '}
                  <span className="font-mono-data font-semibold text-[#202522]">{ec.phone}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-sm text-[#515853]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              In a medical emergency, call local emergency services directly. ElderShield does not dispatch emergency responders automatically.
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}
