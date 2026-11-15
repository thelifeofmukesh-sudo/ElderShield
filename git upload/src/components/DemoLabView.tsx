import { Beaker, RotateCcw } from 'lucide-react';
import type { CareSenseDecision, ElderShieldState } from '../types/eldershield';

interface DemoLabViewProps {
  state: ElderShieldState;
  effectiveNow: Date;
  decisions: CareSenseDecision[];
  onTriggerScenario: (
    scenario:
      | 'upcoming_med'
      | 'due_med'
      | 'overdue_med'
      | 'repeated_unconfirmed'
      | 'upcoming_appt'
      | 'rescheduled_appt'
      | 'caregiver_handover'
      | 'generate_notifications'
  ) => void;
  onSyncAndProcessOutbox: () => Promise<void>;
  onResetDemo: () => void;
  onOpenCareSense: () => void;
}

export function DemoLabView({
  state,
  effectiveNow,
  decisions,
  onTriggerScenario,
  onSyncAndProcessOutbox,
  onResetDemo,
  onOpenCareSense,
}: DemoLabViewProps) {
  const scenarios: Array<{
    id: Parameters<DemoLabViewProps['onTriggerScenario']>[0];
    title: string;
    description: string;
  }> = [
    {
      id: 'upcoming_med',
      title: '1. Upcoming Medication (07:35)',
      description: 'Sets simulated clock 25 minutes before 08:00 Lisinopril to trigger Scenario A.',
    },
    {
      id: 'due_med',
      title: '2. Due Medication (08:10)',
      description: 'Sets clock 10 minutes past 08:00 inside the confirmation window (Scenario B).',
    },
    {
      id: 'overdue_med',
      title: '3. Overdue / Not Yet Confirmed (09:05)',
      description: 'Advances past the 30-minute window to trigger Scenario C caregiver alert.',
    },
    {
      id: 'repeated_unconfirmed',
      title: '4. Repeated Unconfirmed Entries',
      description: 'Creates a 7-day multi-entry pattern on Metformin ER to trigger Scenario F.',
    },
    {
      id: 'upcoming_appt',
      title: '5. Upcoming Appointment Window',
      description: 'Moves primary clinic visit inside its 36-hour reminder window (Scenario G).',
    },
    {
      id: 'rescheduled_appt',
      title: '6. Rescheduled Appointment',
      description: 'Reschedules visit and cancels obsolete pending reminders (Scenario H).',
    },
    {
      id: 'caregiver_handover',
      title: '7. New Caregiver Shift Handover',
      description: 'Appends an unacknowledged shift handover while preserving older notes (Scenario I).',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[#B85E47] bg-[#F6ECD9]/60 p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Beaker className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
              <h1 className="text-3xl font-bold text-[#202522]">
                Demo Laboratory — Accelerated Evaluation Scenarios
              </h1>
            </div>
            <p className="mt-1 text-base text-[#202522]">
              Demonstration-only controls using fictional data. Trigger any CareSense rule or notification scenario instantly, then inspect the live reasoning log.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDemo}
            className="touch-target inline-flex items-center gap-2 rounded-lg border border-[#202522] bg-white px-5 py-3 text-base font-bold text-[#202522] hover:bg-[#EFEAE0] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            <span>Reset Baseline Data</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-base text-[#202522]">
          <span>
            Effective Engine Clock:{' '}
            <strong className="font-mono-data">{effectiveNow.toLocaleString()}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Active CareSense Decisions:{' '}
            <strong className="font-mono-data">{decisions.length}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Outbox Items:{' '}
            <strong className="font-mono-data">{state.notificationOutbox.length}</strong>
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {scenarios.map((sc) => (
          <article
            key={sc.id}
            className="flex flex-col justify-between gap-4 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6"
          >
            <div>
              <h2 className="text-xl font-bold text-[#202522]">{sc.title}</h2>
              <p className="mt-1 text-base text-[#515853]">{sc.description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onTriggerScenario(sc.id)}
                className="touch-target rounded-lg bg-[#202522] px-4 py-2.5 text-base font-bold text-white hover:bg-[#373E3A]"
              >
                Trigger Scenario
              </button>
              <button
                type="button"
                onClick={onOpenCareSense}
                className="touch-target rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base font-semibold text-[#202522] hover:bg-[#EFEAE0]"
              >
                Inspect CareSense
              </button>
            </div>
          </article>
        ))}

        <article className="flex flex-col justify-between gap-4 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <div>
            <h2 className="text-xl font-bold text-[#202522]">
              8. Generate & Process Notification Queue
            </h2>
            <p className="mt-1 text-base text-[#515853]">
              Runs current CareSense decisions through NotifyCare deduplication, quiet hours, and server-side Resend or Demo Simulation processing.
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncAndProcessOutbox}
            className="touch-target w-fit rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934]"
          >
            Process Notification Queue Now
          </button>
        </article>
      </section>
    </div>
  );
}
