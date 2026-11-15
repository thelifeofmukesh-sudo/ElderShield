import { BellRing, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { hasPermission, ROLE_LABELS } from '../engine/permissions';
import type { CareSenseDecision, ElderShieldState, Member } from '../types/eldershield';

interface CareSenseViewProps {
  state: ElderShieldState;
  currentMember: Member;
  effectiveNow: Date;
  decisions: CareSenseDecision[];
  onAcknowledgeDecision: (id: string) => void;
  onSyncAndProcessOutbox: () => void;
  onClearSimulatedClock: () => void;
}

export function CareSenseView({
  state,
  currentMember,
  effectiveNow,
  decisions,
  onAcknowledgeDecision,
  onSyncAndProcessOutbox,
  onClearSimulatedClock,
}: CareSenseViewProps) {
  const canAck = hasPermission(currentMember, 'acknowledge_alerts');

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#202522]">
            CareSense — Explainable Coordination Engine
          </h1>
          <p className="mt-1 max-w-3xl text-base text-[#515853]">
            Deterministic JavaScript rules continuously evaluate medication schedules, elapsed windows, 7-day patterns, appointments, handovers, and notification consent. Every alert explains its reasoning—no black-box claims.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#515853]">
            <span>
              Reference clock:{' '}
              <strong className="font-mono-data text-[#202522]">
                {effectiveNow.toLocaleString()}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Timezone: {state.profile.timezone}</span>
            {state.simulatedNowIso && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onClearSimulatedClock}
                  className="font-semibold text-[#9C4934] underline"
                >
                  Simulated clock active (Reset to live time)
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSyncAndProcessOutbox}
          className="touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0 es-transition"
        >
          <BellRing className="h-5 w-5" aria-hidden="true" />
          <span>Queue & Process Reminders</span>
        </button>
      </section>

      <section aria-label="Transparent CareSense decision log" className="space-y-5">
        {decisions.map((decision) => {
          const borderStyle =
            decision.severity === 'urgent'
              ? 'border-[#A94B45]'
              : decision.severity === 'attention'
              ? 'border-[#654513]/40'
              : 'border-[#DDD6C9]';
          const headerBg =
            decision.severity === 'urgent'
              ? 'bg-[#F6E6E5]'
              : decision.severity === 'attention'
              ? 'bg-[#F6ECD9]'
              : 'bg-[#EFEAE0]';

          return (
            <article
              key={decision.id}
              className={`overflow-hidden rounded-xl border ${borderStyle} bg-[#FAF8F3]`}
            >
              <div className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${headerBg}`}>
                <div className="flex items-start gap-3">
                  {decision.severity === 'urgent' ? (
                    <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-[#A94B45]" aria-hidden="true" />
                  ) : (
                    <Info className="mt-1 h-5 w-5 shrink-0 text-[#202522]" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-mono-data text-xs font-semibold uppercase tracking-wide text-[#515853]">
                      Rule {decision.scenarioCode} · {decision.severity}
                    </p>
                    <h2 className="text-xl font-bold text-[#202522]">{decision.title}</h2>
                  </div>
                </div>

                {decision.acknowledged ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#344737]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Acknowledged
                  </span>
                ) : (
                  canAck && (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeDecision(decision.id)}
                      className="touch-target rounded-lg border border-[#202522] bg-white px-4 py-2 text-sm font-bold text-[#202522] hover:bg-[#EFEAE0] whitespace-nowrap shrink-0"
                    >
                      Acknowledge Alert
                    </button>
                  )
                )}
              </div>

              <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#515853]">
                      1. What Happened
                    </h3>
                    <p className="mt-1 text-base text-[#202522]">{decision.whatHappened}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#515853]">
                      2. Why CareSense Detected It
                    </h3>
                    <p className="mt-1 text-base text-[#202522]">{decision.whyDetected}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#515853]">
                      5. Appropriate Action
                    </h3>
                    <p className="mt-1 text-base font-semibold text-[#202522]">
                      {decision.appropriateAction}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#515853]">
                      3. Relevant Records
                    </h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-[#202522]">
                      {decision.relevantRecords.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                  {decision.whoShouldBeInformed.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-[#515853]">
                        4. Who Should Be Informed (Permission & Preference Check)
                      </h3>
                      <ul className="mt-1 divide-y divide-[#DDD6C9] rounded-lg border border-[#DDD6C9] bg-white">
                        {decision.whoShouldBeInformed.map((rec) => (
                          <li key={rec.memberId} className="px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#202522]">
                                {rec.name} ({ROLE_LABELS[rec.role]})
                              </span>
                              <span
                                className={
                                  rec.notified
                                    ? 'font-semibold text-[#344737]'
                                    : 'font-medium text-[#515853]'
                                }
                              >
                                {rec.notified ? 'Will Notify' : 'Not Notified'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[#515853]">{rec.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
