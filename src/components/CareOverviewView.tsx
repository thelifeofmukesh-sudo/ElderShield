import { ArrowRight, Calendar, Check, ClipboardList, ShieldAlert } from 'lucide-react';
import {
  calculateAdherenceSummary,
  getMedicationStatusForDate,
  isMedicationScheduledOnDate,
} from '../engine/caresense';
import { hasPermission, ROLE_LABELS } from '../engine/permissions';
import type {
  ActiveTab,
  CareSenseDecision,
  ElderShieldState,
  Member,
} from '../types/eldershield';
import { AppointmentStatusText, MedStatusText } from './StatusIndicator';

interface CareOverviewViewProps {
  state: ElderShieldState;
  currentMember: Member;
  effectiveNow: Date;
  decisions: CareSenseDecision[];
  onRecordMedication: (medicationId: string, status: 'taken' | 'skipped', note?: string) => void;
  onAcknowledgeDecision: (id: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export function CareOverviewView({
  state,
  currentMember,
  effectiveNow,
  decisions,
  onRecordMedication,
  onAcknowledgeDecision,
  onNavigate,
}: CareOverviewViewProps) {
  const adherence = calculateAdherenceSummary(state, effectiveNow);
  const todaysMeds = state.medications
    .filter((m) => isMedicationScheduledOnDate(m, effectiveNow))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const upcomingAppts = state.appointments
    .filter((a) => a.status === 'upcoming' || a.status === 'rescheduled')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  const unacknowledgedAlerts = decisions.filter((d) => !d.acknowledged && d.severity !== 'info');
  const pendingHandovers = state.caregiverNotes.filter(
    (n) => n.category === 'handover' && !n.acknowledgedBy
  );
  const canRecord = hasPermission(currentMember, 'record_medication_status');

  return (
    <div className="space-y-8">
      {/* Hero / Profile Summary */}
      <section className="grid grid-cols-1 gap-6 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 lg:grid-cols-12 lg:items-center">
        <div className="space-y-2 lg:col-span-8">
          <p className="text-sm font-semibold text-[#515853]">
            {state.profile.displayName} · Signed in as {currentMember.name} ({ROLE_LABELS[currentMember.role]})
          </p>
          <h1 className="text-3xl font-bold text-[#202522] sm:text-4xl">
            One connected circle of care
          </h1>
          <p className="max-w-2xl text-base text-[#515853]">
            Your health. Your family. Live medication schedules, appointment updates, CareSense explanations, and caregiver handovers stay synchronized across authorized members.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
          <button
            type="button"
            onClick={() => onNavigate('caresense')}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap"
          >
            <span>Open CareSense ({unacknowledgedAlerts.length})</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Care Continuity Summary (4-metric strip) */}
      <section aria-label="Care continuity summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">7-Day Recorded Adherence</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#202522]">
            {adherence.adherencePercent}%
          </p>
          <p className="mt-1 text-sm text-[#515853]">
            {adherence.takenCount} of {adherence.scheduledCount} confirmed
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Active CareSense Alerts</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#A94B45]">
            {unacknowledgedAlerts.length}
          </p>
          <p className="mt-1 text-sm text-[#515853]">Transparent rule explanations</p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Upcoming Visits</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#202522]">
            {upcomingAppts.length}
          </p>
          <p className="mt-1 text-sm text-[#515853]">Shared clinic schedule</p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Open Shift Handovers</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#654513]">
            {pendingHandovers.length}
          </p>
          <p className="mt-1 text-sm text-[#515853]">
            {state.members.filter((m) => m.active).length} active circle members
          </p>
        </div>
      </section>

      {/* Main Two-Column Interconnected Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Today's Medications */}
        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-[#202522]">Today’s Medication Routine</h2>
            <button
              type="button"
              onClick={() => onNavigate('meditrack')}
              className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4 whitespace-nowrap"
            >
              Manage in MediTrack
            </button>
          </div>

          <ul className="divide-y divide-[#DDD6C9]">
            {todaysMeds.map((med) => {
              const { status } = getMedicationStatusForDate(med, state, effectiveNow, effectiveNow);
              const isResolved = status === 'taken' || status === 'skipped';
              return (
                <li
                  key={med.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#515853]">
                      <span className="font-mono-data text-base font-bold text-[#202522]">
                        {med.scheduledTime}
                      </span>
                      <span aria-hidden="true">·</span>
                      <MedStatusText status={status} />
                    </div>
                    <p className="mt-1 text-[22px] font-bold text-[#202522]">{med.name}</p>
                    <p className="text-base text-[#515853]">{med.instructions}</p>
                  </div>

                  {!isResolved && canRecord && (
                    <button
                      type="button"
                      onClick={() => onRecordMedication(med.id, 'taken')}
                      className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#B85E47] px-4 py-2.5 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0"
                    >
                      <Check className="h-5 w-5" aria-hidden="true" />
                      <span>Confirm Taken</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Right Rail: CareSense Attention + Upcoming Appointments + Recent Activity */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
                <ShieldAlert className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
                <span>CareSense Attention</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('caresense')}
                className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4 whitespace-nowrap"
              >
                All rules
              </button>
            </div>

            {unacknowledgedAlerts.length === 0 ? (
              <p className="text-base text-[#344737]">
                All urgent and attention items have been acknowledged.
              </p>
            ) : (
              <ul className="space-y-3">
                {unacknowledgedAlerts.slice(0, 3).map((d) => (
                  <li key={d.id} className="rounded-lg border border-[#DDD6C9] bg-white p-4 space-y-2">
                    <p className="font-mono-data text-xs font-semibold text-[#A94B45]">
                      {d.scenarioCode} · {d.severity}
                    </p>
                    <p className="text-base font-bold text-[#202522]">{d.title}</p>
                    <p className="text-sm text-[#515853]">{d.whatHappened}</p>
                    {hasPermission(currentMember, 'acknowledge_alerts') && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeDecision(d.id)}
                        className="touch-target rounded-lg border border-[#202522] px-3 py-1.5 text-sm font-bold text-[#202522] hover:bg-[#EFEAE0]"
                      >
                        Acknowledge
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
                <Calendar className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
                <span>Upcoming Visits</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('appointments')}
                className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4 whitespace-nowrap"
              >
                AppointmentHub
              </button>
            </div>
            {upcomingAppts.length === 0 ? (
              <p className="text-base text-[#515853]">No upcoming appointments.</p>
            ) : (
              <ul className="divide-y divide-[#DDD6C9]">
                {upcomingAppts.slice(0, 2).map((appt) => (
                  <li key={appt.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono-data font-bold text-[#202522]">
                        {appt.date} · {appt.time}
                      </span>
                      <span aria-hidden="true">·</span>
                      <AppointmentStatusText status={appt.status} />
                    </div>
                    <p className="text-lg font-bold text-[#202522]">{appt.doctorName}</p>
                    <p className="text-sm text-[#515853]">
                      {appt.clinicName} · {appt.specialty}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
                <ClipboardList className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
                <span>Latest Activity</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('familyconnect')}
                className="touch-target px-2 text-base font-semibold text-[#9C4934] underline underline-offset-4 whitespace-nowrap"
              >
                Full timeline
              </button>
            </div>
            <ul className="divide-y divide-[#DDD6C9] text-sm">
              {state.auditEvents.slice(0, 4).map((ev) => (
                <li key={ev.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="font-semibold text-[#202522]">{ev.summary}</p>
                  <p className="font-mono-data text-xs text-[#515853]">
                    {ev.actorName} · {new Date(ev.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
