import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSeedState } from '../../src/data/demoSeed.ts';
import { isWithinQuietHours, runCareSenseEngine } from '../../src/engine/caresense.ts';
import {
  buildPrivacySafeEmailCopy,
  queueNotificationsFromDecisions,
} from '../../src/engine/notifications.ts';
import { hasPermission } from '../../src/engine/permissions.ts';

test('Privacy-safe email subjects never expose medication names', () => {
  const categories = [
    'upcoming_medication',
    'unconfirmed_medication',
    'upcoming_appointment',
    'appointment_rescheduled',
    'caregiver_follow_up',
  ] as const;

  for (const cat of categories) {
    const copy = buildPrivacySafeEmailCopy(cat);
    assert.ok(copy.subject.length > 10);
    assert.doesNotMatch(copy.subject, /Lisinopril|Metformin|Atorvastatin/i);
    assert.doesNotMatch(copy.bodyPreview, /Lisinopril|Metformin|Atorvastatin/i);
  }
});

test('Notification outbox prevents duplicate notifications using deduplicationKey', () => {
  const clock = new Date(2026, 10, 15, 9, 15, 0, 0);
  const state = createDemoSeedState(clock);
  state.simulatedNowIso = clock.toISOString();
  const decisions = runCareSenseEngine(state);

  const firstRun = queueNotificationsFromDecisions(state, decisions, 'demo_simulation');
  assert.ok(firstRun.added.length > 0, 'Expected queued items on first pass');

  state.notificationOutbox = [...firstRun.added, ...state.notificationOutbox];
  const secondRun = queueNotificationsFromDecisions(state, decisions, 'demo_simulation');
  assert.equal(secondRun.added.length, 0, 'Second pass must not queue duplicates');
  assert.ok(secondRun.skippedDuplicates > 0);
});

test('Quiet hours correctly evaluate overnight ranges (22:00 to 07:00)', () => {
  const state = createDemoSeedState();
  const pref = state.notificationPreferences[0];
  pref.quietHoursStart = '22:00';
  pref.quietHoursEnd = '07:00';

  assert.equal(isWithinQuietHours(pref, new Date(2026, 10, 15, 23, 15)), true);
  assert.equal(isWithinQuietHours(pref, new Date(2026, 10, 15, 5, 30)), true);
  assert.equal(isWithinQuietHours(pref, new Date(2026, 10, 15, 14, 0)), false);
});

test('Permissions enforce role boundaries and access revocation', () => {
  const state = createDemoSeedState();
  const owner = state.members.find((m) => m.role === 'elderly_owner')!;
  const caretaker = state.members.find((m) => m.role === 'caretaker')!;

  assert.equal(hasPermission(owner, 'manage_members'), true);
  assert.equal(hasPermission(caretaker, 'manage_members'), false);
  assert.equal(hasPermission(caretaker, 'record_medication_status'), true);

  // Revoke caretaker access
  caretaker.active = false;
  assert.equal(hasPermission(caretaker, 'record_medication_status'), false);
  assert.equal(hasPermission(caretaker, 'view_profile'), false);
});
