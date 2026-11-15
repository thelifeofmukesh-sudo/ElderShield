import { Check, Edit3, Plus, SkipForward, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addDays, formatDateKey } from '../data/demoSeed';
import {
  calculateAdherenceSummary,
  getMedicationStatusForDate,
  isMedicationScheduledOnDate,
} from '../engine/caresense';
import { hasPermission } from '../engine/permissions';
import type { ElderShieldState, Medication, Member } from '../types/eldershield';
import { MedStatusText } from './StatusIndicator';

interface MediTrackViewProps {
  state: ElderShieldState;
  currentMember: Member;
  effectiveNow: Date;
  onRecordMedication: (medicationId: string, status: 'taken' | 'skipped', note?: string) => void;
  onAddMedication: (input: Omit<Medication, 'id' | 'active' | 'createdBy' | 'updatedAt'>) => void;
  onUpdateMedication: (id: string, updates: Partial<Medication>) => void;
  onRemoveMedication: (id: string) => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MediTrackView({
  state,
  currentMember,
  effectiveNow,
  onRecordMedication,
  onAddMedication,
  onUpdateMedication,
  onRemoveMedication,
}: MediTrackViewProps) {
  const [subView, setSubView] = useState<'daily' | 'weekly' | 'history' | 'changes'>('daily');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [skipModalMedId, setSkipModalMedId] = useState<string | null>(null);
  const [skipNote, setSkipNote] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [frequency, setFrequency] = useState<'daily' | 'specific_days'>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState(formatDateKey(effectiveNow));
  const [endDate, setEndDate] = useState('');
  const [prescriberName, setPrescriberName] = useState('');
  const [notes, setNotes] = useState('');
  const [reminderWindowMinutes, setReminderWindowMinutes] = useState(30);
  const [formError, setFormError] = useState('');

  const canManage = hasPermission(currentMember, 'manage_medications');
  const canRecord = hasPermission(currentMember, 'record_medication_status');

  const adherence = calculateAdherenceSummary(state, effectiveNow);
  const todaysMeds = state.medications
    .filter((m) => isMedicationScheduledOnDate(m, effectiveNow))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const openAddForm = () => {
    setEditingId(null);
    setName('');
    setInstructions('');
    setScheduledTime('09:00');
    setFrequency('daily');
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setStartDate(formatDateKey(effectiveNow));
    setEndDate('');
    setPrescriberName('');
    setNotes('');
    setReminderWindowMinutes(30);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (med: Medication) => {
    setEditingId(med.id);
    setName(med.name);
    setInstructions(med.instructions);
    setScheduledTime(med.scheduledTime);
    setFrequency(med.frequency);
    setSelectedDays([...med.selectedDays]);
    setStartDate(med.startDate);
    setEndDate(med.endDate || '');
    setPrescriberName(med.prescriberName);
    setNotes(med.notes);
    setReminderWindowMinutes(med.reminderWindowMinutes);
    setFormError('');
    setShowForm(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instructions.trim() || !scheduledTime) {
      setFormError('Medication name, user-entered instructions, and scheduled time are required.');
      return;
    }
    if (frequency === 'specific_days' && selectedDays.length === 0) {
      setFormError('Select at least one day of the week.');
      return;
    }

    const payload = {
      name: name.trim(),
      instructions: instructions.trim(),
      scheduledTime,
      frequency,
      selectedDays: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : selectedDays,
      startDate,
      endDate: endDate.trim() || null,
      notes: notes.trim(),
      prescriberName: prescriberName.trim() || 'User-entered schedule',
      reminderWindowMinutes: Math.max(5, Math.min(180, Number(reminderWindowMinutes) || 30)),
    };

    if (editingId) {
      onUpdateMedication(editingId, payload);
    } else {
      onAddMedication(payload);
    }
    setShowForm(false);
  };

  const toggleDay = (dayIndex: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(effectiveNow, i - 6));

  return (
    <div className="space-y-8">
      {/* Header & Adherence Summary Strip */}
      <section className="flex flex-col gap-6 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#202522]">MediTrack — Medication Schedules</h1>
          <p className="mt-1 text-base text-[#515853]">
            Authorized schedules, dose confirmations, and full modification history. Unconfirmed entries are never assumed missed.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAddForm}
            className="touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0 es-transition"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>Add Medication</span>
          </button>
        )}
      </section>

      {/* 4-Metric Adherence Summary */}
      <section aria-label="7-day medication adherence summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">7-Day Confirmed Rate</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#202522]">
            {adherence.adherencePercent}%
          </p>
          <p className="mt-1 text-sm text-[#515853]">
            {adherence.takenCount} of {adherence.scheduledCount} slots
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Confirmed Taken</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#344737]">
            {adherence.takenCount}
          </p>
          <p className="mt-1 text-sm text-[#515853]">Duplicate-protected</p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Not Yet Confirmed</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#A94B45]">
            {adherence.unconfirmedCount}
          </p>
          <p className="mt-1 text-sm text-[#515853]">Requires gentle check-in</p>
        </div>
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-5">
          <p className="text-sm font-medium text-[#515853]">Logged Skipped</p>
          <p className="font-mono-data mt-2 text-3xl font-bold text-[#654513]">
            {adherence.skippedCount}
          </p>
          <p className="mt-1 text-sm text-[#515853]">Never auto-doubled</p>
        </div>
      </section>

      {/* Segmented Sub-Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-[#DDD6C9] pb-3" role="tablist" aria-label="MediTrack views">
        {(
          [
            ['daily', 'Daily Schedule'],
            ['weekly', '7-Day Matrix'],
            ['history', 'Confirmation History'],
            ['changes', 'Schedule Audit Trail'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subView === id}
            onClick={() => setSubView(id)}
            className={`touch-target rounded-lg px-4 py-2.5 text-base font-semibold whitespace-nowrap shrink-0 es-transition ${
              subView === id
                ? 'bg-[#202522] text-[#FAF8F3]'
                : 'bg-[#EFEAE0] text-[#202522] hover:bg-[#DDD6C9]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add / Edit Medication Form */}
      {showForm && (
        <form
          onSubmit={handleFormSubmit}
          className="space-y-5 rounded-xl border border-[#B85E47] bg-[#FAF8F3] p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-[#202522]">
              {editingId ? 'Edit Medication Schedule' : 'Add Medication Schedule'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="touch-target px-3 text-base font-semibold text-[#515853] underline"
            >
              Cancel
            </button>
          </div>

          <p className="text-base text-[#515853]">
            Enter exact instructions provided by the prescriber or profile owner. ElderShield never invents dosages.
          </p>

          {formError && (
            <div className="rounded-lg bg-[#F6E6E5] p-3 text-base font-semibold text-[#7F2D28]" role="alert">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Medication Name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Lisinopril 10mg"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Scheduled Time *</span>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
                required
              />
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-base font-semibold text-[#202522]">Prescribed / User-Entered Instructions *</span>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Take 1 tablet after breakfast with water"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Prescriber Name</span>
              <input
                type="text"
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
                placeholder="e.g., Dr. Elena Rostova"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">
                Confirmation Window (minutes before alert)
              </span>
              <input
                type="number"
                min={5}
                max={180}
                value={reminderWindowMinutes}
                onChange={(e) => setReminderWindowMinutes(Number(e.target.value))}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Optional End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-base font-semibold text-[#202522]">Frequency</span>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setFrequency('daily')}
                className={`touch-target rounded-lg border px-4 py-2 text-base font-semibold ${
                  frequency === 'daily'
                    ? 'border-[#202522] bg-[#202522] text-white'
                    : 'border-[#DDD6C9] bg-white text-[#202522]'
                }`}
              >
                Every Day
              </button>
              <button
                type="button"
                onClick={() => setFrequency('specific_days')}
                className={`touch-target rounded-lg border px-4 py-2 text-base font-semibold ${
                  frequency === 'specific_days'
                    ? 'border-[#202522] bg-[#202522] text-white'
                    : 'border-[#DDD6C9] bg-white text-[#202522]'
                }`}
              >
                Specific Days
              </button>
            </div>
            {frequency === 'specific_days' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAY_NAMES.map((dName, idx) => (
                  <button
                    key={dName}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`touch-target rounded-lg border px-3 py-2 text-sm font-semibold ${
                      selectedDays.includes(idx)
                        ? 'border-[#B85E47] bg-[#B85E47] text-white'
                        : 'border-[#DDD6C9] bg-white text-[#202522]'
                    }`}
                  >
                    {dName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-base font-semibold text-[#202522]">Care Notes (Optional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Keep bottle on breakfast tray"
              className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base text-[#202522]"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="touch-target rounded-lg bg-[#B85E47] px-6 py-3 text-base font-bold text-white hover:bg-[#9C4934]"
            >
              {editingId ? 'Save Schedule Changes' : 'Save Medication'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="touch-target rounded-lg border border-[#DDD6C9] bg-white px-5 py-3 text-base font-semibold text-[#202522]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Daily Schedule View */}
      {subView === 'daily' && (
        <div className="space-y-4">
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
                className="flex flex-col justify-between gap-5 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 lg:flex-row lg:items-center"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-[#515853]">
                    <span className="font-mono-data text-lg font-semibold text-[#202522]">
                      {med.scheduledTime}
                    </span>
                    <span aria-hidden="true">·</span>
                    <MedStatusText status={status} />
                    <span aria-hidden="true">·</span>
                    <span>Prescriber: {med.prescriberName}</span>
                  </div>
                  <h2 className="text-[22px] font-bold text-[#202522]">{med.name}</h2>
                  <p className="text-base text-[#202522]">{med.instructions}</p>
                  {med.notes && <p className="text-base text-[#515853]">Note: {med.notes}</p>}
                  {event && (
                    <p className="text-sm text-[#515853]">
                      Logged as <strong>{event.status}</strong> by {event.recordedByName} at{' '}
                      <span className="font-mono-data">
                        {new Date(event.recordedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {event.note ? ` — "${event.note}"` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {!isResolved && canRecord && (
                    <>
                      <button
                        type="button"
                        onClick={() => onRecordMedication(med.id, 'taken')}
                        className="touch-target inline-flex items-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap"
                      >
                        <Check className="h-5 w-5" aria-hidden="true" />
                        <span>Mark Taken</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSkipModalMedId(med.id);
                          setSkipNote('');
                        }}
                        className="touch-target inline-flex items-center gap-2 rounded-lg border border-[#DDD6C9] bg-[#F4F0E7] px-4 py-3 text-base font-semibold text-[#202522] hover:bg-[#EFEAE0] whitespace-nowrap"
                      >
                        <SkipForward className="h-5 w-5" aria-hidden="true" />
                        <span>Skip</span>
                      </button>
                    </>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditForm(med)}
                        aria-label={`Edit ${med.name}`}
                        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#DDD6C9] bg-white px-4 py-3 text-base font-semibold text-[#202522] hover:bg-[#EFEAE0]"
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveMedication(med.id)}
                        aria-label={`Remove ${med.name}`}
                        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#A94B45]/40 bg-white px-4 py-3 text-base font-semibold text-[#A94B45] hover:bg-[#F6E6E5]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Weekly 7-Day Overview */}
      {subView === 'weekly' && (
        <div className="overflow-x-auto rounded-xl border border-[#DDD6C9] bg-[#FAF8F3]">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#DDD6C9] bg-[#EFEAE0]">
                <th className="p-4 text-base font-bold text-[#202522]">Medication</th>
                {weekDates.map((d) => (
                  <th key={formatDateKey(d)} className="p-4 text-sm font-semibold text-[#202522]">
                    <div>{WEEKDAY_NAMES[d.getDay()]}</div>
                    <div className="font-mono-data text-xs text-[#515853]">
                      {formatDateKey(d).slice(5)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD6C9]">
              {state.medications.map((med) => (
                <tr key={med.id}>
                  <td className="p-4">
                    <div className="text-lg font-bold text-[#202522]">{med.name}</div>
                    <div className="font-mono-data text-sm text-[#515853]">{med.scheduledTime}</div>
                  </td>
                  {weekDates.map((d) => {
                    const key = formatDateKey(d);
                    if (!isMedicationScheduledOnDate(med, d)) {
                      return (
                        <td key={key} className="p-4 text-sm text-[#515853]">
                          Off
                        </td>
                      );
                    }
                    const { status } = getMedicationStatusForDate(med, state, d, effectiveNow);
                    const cellLabel =
                      status === 'taken'
                        ? 'Taken'
                        : status === 'skipped'
                        ? 'Skipped'
                        : status === 'due'
                        ? 'Due'
                        : status === 'upcoming'
                        ? 'Upcoming'
                        : 'Unconfirmed';
                    const cellColor =
                      status === 'taken'
                        ? 'text-[#344737] font-semibold'
                        : status === 'unconfirmed'
                        ? 'text-[#A94B45] font-semibold'
                        : status === 'due'
                        ? 'text-[#654513] font-semibold'
                        : 'text-[#515853]';
                    return (
                      <td key={key} className={`p-4 text-sm ${cellColor}`}>
                        {cellLabel}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation History */}
      {subView === 'history' && (
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <h2 className="text-2xl font-bold text-[#202522]">Medication Confirmation History</h2>
          {state.medicationEvents.length === 0 ? (
            <p className="mt-4 text-base text-[#515853]">No confirmation events logged yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#DDD6C9]">
              {state.medicationEvents.map((ev) => {
                const med = state.medications.find((m) => m.id === ev.medicationId);
                return (
                  <li key={ev.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-bold text-[#202522]">
                        {med?.name || ev.medicationId} —{' '}
                        <span className={ev.status === 'taken' ? 'text-[#344737]' : 'text-[#654513]'}>
                          {ev.status === 'taken' ? 'Taken' : 'Skipped'}
                        </span>
                      </p>
                      <p className="text-base text-[#515853]">
                        Confirmed by {ev.recordedByName} ({ev.recordedByRole.replace('_', ' ')})
                        {ev.note ? ` · Note: "${ev.note}"` : ''}
                      </p>
                    </div>
                    <div className="font-mono-data text-sm text-[#515853]">
                      {ev.dateKey} · {ev.scheduledTime}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Schedule Change Audit Trail */}
      {subView === 'changes' && (
        <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <h2 className="text-2xl font-bold text-[#202522]">Medication Schedule Audit Trail</h2>
          <p className="mt-1 text-base text-[#515853]">
            Every modification to medication times, instructions, or prescribers records previous and new values.
          </p>
          {state.medicationChangeLogs.length === 0 ? (
            <p className="mt-4 text-base text-[#515853]">No schedule modifications recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#DDD6C9]">
              {state.medicationChangeLogs.map((chg) => (
                <li key={chg.id} className="py-4 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-lg font-bold text-[#202522]">
                      {chg.medicationName} · {chg.field}
                    </span>
                    <span className="font-mono-data text-sm text-[#515853]">
                      {new Date(chg.changedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-base text-[#202522]">
                    Changed from <span className="line-through text-[#515853]">{chg.previousValue || '—'}</span>{' '}
                    to <strong>{chg.newValue || '—'}</strong> by {chg.changedByName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Accessible Skip Dialog */}
      {skipModalMedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#202522]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-dialog-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
            <h2 id="skip-dialog-title" className="text-2xl font-bold text-[#202522]">
              Record Skipped Entry
            </h2>
            <p className="text-base text-[#515853]">
              Add an optional reason for the care circle. ElderShield will never advise taking an extra or double dose.
            </p>
            <input
              type="text"
              value={skipNote}
              onChange={(e) => setSkipNote(e.target.value)}
              placeholder="Optional note (e.g., resting, pharmacist advised holding)"
              className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-3 text-base text-[#202522]"
            />
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setSkipModalMedId(null)}
                className="touch-target rounded-lg border border-[#DDD6C9] bg-white px-5 py-3 text-base font-semibold text-[#202522]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRecordMedication(skipModalMedId, 'skipped', skipNote);
                  setSkipModalMedId(null);
                }}
                className="touch-target rounded-lg bg-[#202522] px-5 py-3 text-base font-bold text-white"
              >
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
