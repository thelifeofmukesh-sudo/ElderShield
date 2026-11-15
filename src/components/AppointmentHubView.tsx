import { Calendar, CheckCircle2, Edit3, MapPin, Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { addDays, formatDateKey } from '../data/demoSeed';
import { hasPermission } from '../engine/permissions';
import type { Appointment, AppointmentStatus, ElderShieldState, Member } from '../types/eldershield';
import { AppointmentStatusText } from './StatusIndicator';

interface AppointmentHubViewProps {
  state: ElderShieldState;
  currentMember: Member;
  effectiveNow: Date;
  onAddAppointment: (input: Omit<Appointment, 'id' | 'updatedByName' | 'updatedAt'>) => void;
  onUpdateAppointment: (id: string, updates: Partial<Appointment>) => void;
}

export function AppointmentHubView({
  state,
  currentMember,
  effectiveNow,
  onAddAppointment,
  onUpdateAppointment,
}: AppointmentHubViewProps) {
  const [filter, setFilter] = useState<'upcoming' | 'calendar' | 'past'>('upcoming');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(formatDateKey(addDays(effectiveNow, 2)));
  const [time, setTime] = useState('10:00');
  const [status, setStatus] = useState<AppointmentStatus>('upcoming');
  const [preparationNotes, setPreparationNotes] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [reminderLeadHours, setReminderLeadHours] = useState(24);
  const [formError, setFormError] = useState('');

  const canManage = hasPermission(currentMember, 'manage_appointments');
  const canView = hasPermission(currentMember, 'view_appointments');

  if (!canView) {
    return (
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-8">
        <h1 className="text-2xl font-bold text-[#202522]">Appointment Access Restricted</h1>
        <p className="mt-2 text-base text-[#515853]">
          The Elderly Profile Owner has not enabled appointment viewing for your current role.
        </p>
      </section>
    );
  }

  const upcomingList = state.appointments
    .filter((a) => a.status === 'upcoming' || a.status === 'rescheduled')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  const pastList = state.appointments
    .filter((a) => a.status === 'completed' || a.status === 'cancelled')
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));

  const openAdd = () => {
    setEditingId(null);
    setDoctorName('');
    setSpecialty('');
    setClinicName('');
    setLocation('');
    setDate(formatDateKey(addDays(effectiveNow, 2)));
    setTime('10:00');
    setStatus('upcoming');
    setPreparationNotes('');
    setFollowUpNotes('');
    setReminderLeadHours(24);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingId(appt.id);
    setDoctorName(appt.doctorName);
    setSpecialty(appt.specialty);
    setClinicName(appt.clinicName);
    setLocation(appt.location);
    setDate(appt.date);
    setTime(appt.time);
    setStatus(appt.status);
    setPreparationNotes(appt.preparationNotes);
    setFollowUpNotes(appt.followUpNotes);
    setReminderLeadHours(appt.reminderLeadHours);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorName.trim() || !clinicName.trim() || !date || !time) {
      setFormError('Doctor name, clinic/hospital name, date, and time are required.');
      return;
    }
    const payload = {
      doctorName: doctorName.trim(),
      specialty: specialty.trim() || 'General Consultation',
      clinicName: clinicName.trim(),
      location: location.trim() || 'Recorded clinic address',
      date,
      time,
      status,
      preparationNotes: preparationNotes.trim(),
      followUpNotes: followUpNotes.trim(),
      reminderLeadHours: Math.max(1, Math.min(168, Number(reminderLeadHours) || 24)),
    };

    if (editingId) {
      onUpdateAppointment(editingId, payload);
    } else {
      onAddAppointment(payload);
    }
    setShowForm(false);
  };

  // Build 14-day calendar overview from effectiveNow
  const calendarDays = Array.from({ length: 14 }, (_, idx) => {
    const dayDate = addDays(effectiveNow, idx);
    const key = formatDateKey(dayDate);
    const appts = state.appointments.filter((a) => a.date === key && a.status !== 'cancelled');
    return { dayDate, key, appts };
  });

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#202522]">
            AppointmentHub — Doctor Visits & Follow-Ups
          </h1>
          <p className="mt-1 text-base text-[#515853]">
            Coordinate clinic appointments, preparation checklists, and rescheduling updates across the care circle.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0 es-transition"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>Add Appointment</span>
          </button>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-b border-[#DDD6C9] pb-3" role="tablist" aria-label="Appointment views">
        {(
          [
            ['upcoming', `Upcoming (${upcomingList.length})`],
            ['calendar', '14-Day Calendar Overview'],
            ['past', `Past & Cancelled (${pastList.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`touch-target rounded-lg px-4 py-2.5 text-base font-semibold whitespace-nowrap shrink-0 es-transition ${
              filter === id
                ? 'bg-[#202522] text-[#FAF8F3]'
                : 'bg-[#EFEAE0] text-[#202522] hover:bg-[#DDD6C9]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-[#B85E47] bg-[#FAF8F3] p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[#202522]">
              {editingId ? 'Edit or Reschedule Appointment' : 'Schedule New Appointment'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="touch-target px-3 text-base font-semibold text-[#515853] underline"
            >
              Cancel
            </button>
          </div>
          {formError && (
            <div className="rounded-lg bg-[#F6E6E5] p-3 text-base font-semibold text-[#7F2D28]" role="alert">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Doctor Name *</span>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="e.g., Dr. Elena Rostova"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Specialty</span>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g., Internal Medicine"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Clinic or Hospital *</span>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="e.g., Oakridge Community Clinic"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Location / Suite</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Suite 204, 420 Maple Ave"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Date *</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Time *</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Reminder Lead Window (Hours)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={reminderLeadHours}
                onChange={(e) => setReminderLeadHours(Number(e.target.value))}
                className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-semibold text-[#202522]">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
              >
                <option value="upcoming">Upcoming</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-base font-semibold text-[#202522]">Preparation Notes</span>
            <textarea
              rows={2}
              value={preparationNotes}
              onChange={(e) => setPreparationNotes(e.target.value)}
              placeholder="Items to bring, fasting instructions, or questions for the doctor"
              className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-base font-semibold text-[#202522]">Follow-Up Notes</span>
            <textarea
              rows={2}
              value={followUpNotes}
              onChange={(e) => setFollowUpNotes(e.target.value)}
              placeholder="Post-visit instructions or follow-up scheduling notes"
              className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="touch-target rounded-lg bg-[#B85E47] px-6 py-3 text-base font-bold text-white hover:bg-[#9C4934]"
            >
              {editingId ? 'Save Appointment Update' : 'Create Appointment'}
            </button>
          </div>
        </form>
      )}

      {filter === 'calendar' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {calendarDays.map(({ dayDate, key, appts }) => (
            <div
              key={key}
              className={`min-h-[130px] rounded-xl border p-4 ${
                appts.length > 0
                  ? 'border-[#B85E47] bg-[#FAF8F3]'
                  : 'border-[#DDD6C9] bg-[#FAF8F3]/60'
              }`}
            >
              <p className="text-sm font-semibold text-[#515853]">
                {dayDate.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <p className="font-mono-data text-lg font-bold text-[#202522]">
                {dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
              {appts.length === 0 ? (
                <p className="mt-3 text-sm text-[#515853]">No visits</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {appts.map((a) => (
                    <li key={a.id} className="rounded-lg bg-[#EFEAE0] p-2 text-sm">
                      <p className="font-mono-data font-bold text-[#202522]">{a.time}</p>
                      <p className="font-semibold text-[#202522]">{a.doctorName}</p>
                      <p className="text-xs text-[#515853]">{a.clinicName}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(filter === 'upcoming' ? upcomingList : pastList).map((appt) => (
            <article
              key={appt.id}
              className="flex flex-col justify-between gap-5 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 lg:flex-row lg:items-start"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
                  <span className="inline-flex items-center gap-1.5 font-mono-data font-bold text-[#202522]">
                    <Calendar className="h-4 w-4 text-[#B85E47]" aria-hidden="true" />
                    {appt.date} · {appt.time}
                  </span>
                  <span aria-hidden="true">·</span>
                  <AppointmentStatusText status={appt.status} />
                  <span aria-hidden="true">·</span>
                  <span className="text-sm text-[#515853]">
                    Reminder window: {appt.reminderLeadHours}h prior
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-[#202522]">
                  {appt.doctorName}{' '}
                  <span className="text-lg font-normal text-[#515853]">({appt.specialty})</span>
                </h2>
                <p className="flex items-center gap-2 text-base text-[#202522]">
                  <MapPin className="h-4 w-4 shrink-0 text-[#515853]" aria-hidden="true" />
                  <span>
                    {appt.clinicName} — {appt.location}
                  </span>
                </p>
                {appt.preparationNotes && (
                  <p className="rounded-lg bg-[#F4F0E7] p-3 text-base text-[#202522]">
                    <strong>Preparation:</strong> {appt.preparationNotes}
                  </p>
                )}
                {appt.followUpNotes && (
                  <p className="rounded-lg bg-[#E7ECE7] p-3 text-base text-[#202522]">
                    <strong>Follow-Up:</strong> {appt.followUpNotes}
                  </p>
                )}
                <p className="text-sm text-[#515853]">
                  Last updated by {appt.updatedByName} ·{' '}
                  <span className="font-mono-data">
                    {new Date(appt.updatedAt).toLocaleString()}
                  </span>
                </p>
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(appt)}
                    className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base font-semibold text-[#202522] hover:bg-[#EFEAE0]"
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    <span>Edit / Reschedule</span>
                  </button>
                  {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateAppointment(appt.id, { status: 'completed' })}
                        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#344737]/40 bg-white px-4 py-2.5 text-base font-semibold text-[#344737] hover:bg-[#E7ECE7]"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Complete</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateAppointment(appt.id, { status: 'cancelled' })}
                        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#A94B45]/40 bg-white px-4 py-2.5 text-base font-semibold text-[#A94B45] hover:bg-[#F6E6E5]"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
