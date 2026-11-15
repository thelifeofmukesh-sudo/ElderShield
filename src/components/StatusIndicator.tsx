import { AlertCircle, CalendarClock, CheckCircle2, Clock, MinusCircle } from 'lucide-react';
import type { AppointmentStatus, MedicationComputedStatus, NotificationDeliveryStatus } from '../types/eldershield';

export function MedStatusText({ status }: { status: MedicationComputedStatus }) {
  switch (status) {
    case 'taken':
      return (
        <span className="inline-flex items-center gap-2 font-medium text-[#344737]">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Confirmed Taken</span>
        </span>
      );
    case 'due':
      return (
        <span className="inline-flex items-center gap-2 font-medium text-[#654513]">
          <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Due — Not Yet Confirmed</span>
        </span>
      );
    case 'unconfirmed':
      return (
        <span className="inline-flex items-center gap-2 font-semibold text-[#A94B45]">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Overdue — Not Yet Confirmed</span>
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-2 font-medium text-[#515853]">
          <MinusCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Skipped (Logged)</span>
        </span>
      );
    case 'upcoming':
      return (
        <span className="inline-flex items-center gap-2 font-medium text-[#515853]">
          <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Scheduled Upcoming</span>
        </span>
      );
  }
}

export function AppointmentStatusText({ status }: { status: AppointmentStatus }) {
  const map: Record<AppointmentStatus, { label: string; cls: string }> = {
    upcoming: { label: 'Upcoming Visit', cls: 'text-[#344737]' },
    completed: { label: 'Completed', cls: 'text-[#515853]' },
    rescheduled: { label: 'Rescheduled', cls: 'text-[#654513]' },
    cancelled: { label: 'Cancelled', cls: 'text-[#A94B45]' },
  };
  const info = map[status];
  return <span className={`font-semibold ${info.cls}`}>{info.label}</span>;
}

export function OutboxStatusText({ status }: { status: NotificationDeliveryStatus }) {
  const map: Record<NotificationDeliveryStatus, { label: string; cls: string }> = {
    queued: { label: 'Queued for Processing', cls: 'text-[#654513]' },
    simulated_sent: { label: 'Simulated (Demo Only — No Real Email Sent)', cls: 'text-[#654513]' },
    sent_live: { label: 'Delivered via Resend', cls: 'text-[#344737]' },
    failed: { label: 'Delivery Failed', cls: 'text-[#A94B45]' },
    suppressed_quiet_hours: { label: 'Suppressed (Quiet Hours)', cls: 'text-[#515853]' },
    cancelled: { label: 'Cancelled (Superseded)', cls: 'text-[#515853]' },
  };
  const info = map[status];
  return <span className={`font-medium ${info.cls}`}>{info.label}</span>;
}
