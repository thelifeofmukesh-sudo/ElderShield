import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, createDemoSeedState, formatDateKey } from '../../src/data/demoSeed.ts';
import {
  calculateAdherenceSummary,
  getMedicationStatusForDate,
  runCareSenseEngine,
} from '../../src/engine/caresense.ts';

function withClock(hour: number, minute: number) {
  const base = new Date(2026, 10, 15, hour, minute, 0, 0);
  const state = createDemoSeedState(base);
  state.simulatedNowIso = base.toISOString();
  state.medicationEvents = state.medicationEvents.filter(
    (e) => e.dateKey !== formatDateKey(base)
  );
  return { base, state };
}

test('Scenario A: Detects upcoming medication within 45 minutes prior to schedule', () => {
  const { state } = withClock(7, 35); // 25 min before 08:00 Lisinopril
  const decisions = runCareSenseEngine(state);
  const upcoming = decisions.find((d) => d.scenarioCode === 'A_UPCOMING_MED');
  assert.ok(upcoming, 'Expected A_UPCOMING_MED decision');
  assert.match(upcoming.whatHappened, /Lisinopril 10mg/);
  assert.ok(upcoming.relevantRecords.length >= 2);
});

test('Scenario B: Detects due medication inside confirmation window without assuming missed', () => {
  const { state } = withClock(8, 12); // 12 min past 08:00 (window is 30m)
  const decisions = runCareSenseEngine(state);
  const due = decisions.find((d) => d.scenarioCode === 'B_DUE_MED');
  assert.ok(due, 'Expected B_DUE_MED decision');
  assert.match(due.whatHappened, /not yet confirmed/i);
});

test('Scenario C: Detects overdue/unconfirmed medication past reminder window with compassionate phrasing', () => {
  const { state } = withClock(9, 10); // 70 min past 08:00
  const decisions = runCareSenseEngine(state);
  const overdue = decisions.find((d) => d.scenarioCode === 'C_OVERDUE_MED');
  assert.ok(overdue, 'Expected C_OVERDUE_MED decision');
  assert.equal(overdue.severity, 'urgent');
  assert.match(overdue.title, /Not yet confirmed/i);
  assert.match(overdue.appropriateAction, /Never advise taking an extra dose/i);
});

test('Scenario D & E: Marking taken updates adherence; skipped flags review without doubling', () => {
  const { base, state } = withClock(9, 10);
  const todayKey = formatDateKey(base);
  state.medicationEvents.push({
    id: 'evt_test_taken',
    medicationId: 'med_lisinopril_demo',
    dateKey: todayKey,
    scheduledTime: '08:00',
    status: 'taken',
    recordedByMemberId: 'member_owner_arthur',
    recordedByName: 'Arthur Pendelton',
    recordedByRole: 'elderly_owner',
    recordedAt: base.toISOString(),
    note: '',
    deduplicationKey: `med_lisinopril_demo_${todayKey}_08:00`,
  });
  state.medicationEvents.push({
    id: 'evt_test_skipped',
    medicationId: 'med_vitd3_demo',
    dateKey: todayKey,
    scheduledTime: '12:30',
    status: 'skipped',
    recordedByMemberId: 'member_caretaker_sam',
    recordedByName: 'Samuel Okafor',
    recordedByRole: 'caretaker',
    recordedAt: base.toISOString(),
    note: 'Held per pharmacist note',
    deduplicationKey: `med_vitd3_demo_${todayKey}_12:30`,
  });

  const decisions = runCareSenseEngine(state);
  assert.ok(decisions.some((d) => d.scenarioCode === 'D_TAKEN'));
  const skipDecision = decisions.find((d) => d.scenarioCode === 'E_SKIPPED');
  assert.ok(skipDecision, 'Expected E_SKIPPED decision');
  assert.match(skipDecision.appropriateAction, /Do NOT recommend taking an extra/i);

  const statusObj = getMedicationStatusForDate(
    state.medications[0],
    state,
    base,
    base
  );
  assert.equal(statusObj.status, 'taken');

  const adherence = calculateAdherenceSummary(state, base);
  assert.ok(adherence.takenCount >= 1);
});

test('Scenario F: Detects repeated unconfirmed entries across past 7 days', () => {
  const { state } = withClock(19, 0);
  // Clear Metformin ER events so multiple past days appear unconfirmed
  state.medicationEvents = state.medicationEvents.filter(
    (e) => e.medicationId !== 'med_metformin_demo'
  );
  const decisions = runCareSenseEngine(state);
  const repeated = decisions.find(
    (d) =>
      d.scenarioCode === 'F_REPEATED_UNCONFIRMED' &&
      d.relatedEntityId === 'med_metformin_demo'
  );
  assert.ok(repeated, 'Expected F_REPEATED_UNCONFIRMED decision');
  assert.match(repeated.whatHappened, /unconfirmed or skipped entries/i);
});

test('Scenario G, H, I & J: Appointments, Handovers, and Notification Preference filtering', () => {
  const { base, state } = withClock(10, 0);
  // Ensure tomorrow's appointment is within reminder window
  state.appointments[0].date = formatDateKey(addDays(base, 1));
  state.appointments[0].status = 'upcoming';

  // Opt Claire out of upcomingAppointment and test Scenario J filtering
  const clairePref = state.notificationPreferences.find(
    (p) => p.memberId === 'member_family_claire'
  )!;
  clairePref.upcomingAppointment = false;

  const decisions = runCareSenseEngine(state);
  const upcomingAppt = decisions.find((d) => d.scenarioCode === 'G_UPCOMING_APPT');
  assert.ok(upcomingAppt, 'Expected G_UPCOMING_APPT decision');
  const claireRouting = upcomingAppt.whoShouldBeInformed.find(
    (r) => r.memberId === 'member_family_claire'
  );
  assert.equal(claireRouting?.notified, false);
  assert.match(claireRouting?.reason || '', /opted out/i);

  assert.ok(decisions.some((d) => d.scenarioCode === 'H_RESCHEDULED_APPT'));
  assert.ok(decisions.some((d) => d.scenarioCode === 'I_HANDOVER'));
  assert.ok(decisions.some((d) => d.scenarioCode === 'J_PREF_FILTER'));
});
