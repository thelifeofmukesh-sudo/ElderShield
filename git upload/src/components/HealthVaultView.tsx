import { Lock, Phone, Plus, Shield } from 'lucide-react';
import { useState } from 'react';
import { hasPermission, ROLE_LABELS } from '../engine/permissions';
import type { ElderShieldState, EmergencyContact, Member } from '../types/eldershield';

interface HealthVaultViewProps {
  state: ElderShieldState;
  currentMember: Member;
  onAddEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => void;
  onUpdateCategoryConsent: (
    memberId: string,
    category: keyof Member['canViewHealthVaultCategories'],
    allowed: boolean
  ) => void;
}

const VAULT_CATEGORY_LABELS: Array<{
  key: keyof Member['canViewHealthVaultCategories'];
  label: string;
}> = [
  { key: 'basicProfile', label: 'Basic Profile' },
  { key: 'emergencyContacts', label: 'Emergency Contacts' },
  { key: 'healthcareNotes', label: 'Healthcare Notes' },
  { key: 'prescriberDetails', label: 'Prescriber Details' },
  { key: 'medicationList', label: 'Medication List' },
  { key: 'appointmentHistory', label: 'Appointment History' },
];

export function HealthVaultView({
  state,
  currentMember,
  onAddEmergencyContact,
  onUpdateCategoryConsent,
}: HealthVaultViewProps) {
  const [ecName, setEcName] = useState('');
  const [ecRel, setEcRel] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecNotes, setEcNotes] = useState('');
  const [showEcForm, setShowEcForm] = useState(false);

  const canManage = hasPermission(currentMember, 'manage_members');
  const access = currentMember.canViewHealthVaultCategories;

  const handleAddEc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ecName.trim() || !ecPhone.trim()) return;
    onAddEmergencyContact({
      name: ecName.trim(),
      relationship: ecRel.trim() || 'Emergency Contact',
      phone: ecPhone.trim(),
      notes: ecNotes.trim(),
      priority: state.emergencyContacts.length + 1,
    });
    setEcName('');
    setEcRel('');
    setEcPhone('');
    setEcNotes('');
    setShowEcForm(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Shield className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-[#202522]">
            HealthVault — Personal Healthcare Profile & Consent
          </h1>
        </div>
        <p className="text-base text-[#515853]">
          Centralized care summary using data minimization. ElderShield is a family care coordination platform, <strong>not</strong> a certified Electronic Medical Record (EMR/EHR).
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Basic Profile */}
        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-3">
          <h2 className="text-2xl font-bold text-[#202522]">Profile Overview</h2>
          {access.basicProfile ? (
            <dl className="divide-y divide-[#DDD6C9] text-base">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#515853]">Profile Name</dt>
                <dd className="font-bold text-[#202522]">{state.profile.displayName}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#515853]">Birth Year</dt>
                <dd className="font-mono-data font-bold text-[#202522]">{state.profile.birthYear}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#515853]">Time Zone</dt>
                <dd className="font-mono-data text-[#202522]">{state.profile.timezone}</dd>
              </div>
              {access.prescriberDetails ? (
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-[#515853]">Primary Physician</dt>
                  <dd className="font-semibold text-[#202522]">{state.profile.primaryPhysician}</dd>
                </div>
              ) : (
                <div className="py-2.5 flex items-center gap-2 text-sm text-[#515853]">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  <span>Prescriber details restricted by Profile Owner consent</span>
                </div>
              )}
              <div className="py-2.5 space-y-1">
                <dt className="text-[#515853]">Allergies & Care Preferences</dt>
                <dd className="text-[#202522]">{state.profile.allergiesNote}</dd>
                <dd className="text-[#515853]">{state.profile.carePreferences}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-base text-[#515853]">Basic profile viewing is restricted for your role.</p>
          )}
        </section>

        {/* Emergency Information Card */}
        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-[#202522]">
              <Phone className="h-5 w-5 text-[#B85E47]" aria-hidden="true" />
              <span>Emergency Information Card</span>
            </h2>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowEcForm((v) => !v)}
                className="touch-target inline-flex items-center gap-1 rounded-lg border border-[#DDD6C9] bg-white px-3 py-2 text-sm font-bold text-[#202522]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Contact</span>
              </button>
            )}
          </div>

          <p className="rounded-lg bg-[#F6ECD9] p-3 text-sm text-[#654513]">
            User-entered contacts only. ElderShield does not provide automatic emergency dispatch or ambulance routing.
          </p>

          {showEcForm && (
            <form onSubmit={handleAddEc} className="space-y-3 rounded-lg border border-[#DDD6C9] bg-white p-4">
              <input
                type="text"
                value={ecName}
                onChange={(e) => setEcName(e.target.value)}
                placeholder="Contact Name *"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] px-3 py-2 text-base"
                required
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={ecRel}
                  onChange={(e) => setEcRel(e.target.value)}
                  placeholder="Relationship"
                  className="touch-target w-full rounded-lg border border-[#DDD6C9] px-3 py-2 text-base"
                />
                <input
                  type="tel"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  placeholder="Phone Number *"
                  className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] px-3 py-2 text-base"
                  required
                />
              </div>
              <input
                type="text"
                value={ecNotes}
                onChange={(e) => setEcNotes(e.target.value)}
                placeholder="Helpful notes"
                className="touch-target w-full rounded-lg border border-[#DDD6C9] px-3 py-2 text-base"
              />
              <button
                type="submit"
                className="touch-target rounded-lg bg-[#B85E47] px-4 py-2 text-base font-bold text-white"
              >
                Save Contact
              </button>
            </form>
          )}

          {access.emergencyContacts ? (
            <ul className="divide-y divide-[#DDD6C9]">
              {state.emergencyContacts.map((ec) => (
                <li key={ec.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-lg font-bold text-[#202522]">{ec.name}</span>
                    <span className="font-mono-data text-lg font-bold text-[#9C4934]">{ec.phone}</span>
                  </div>
                  <p className="text-sm text-[#515853]">
                    {ec.relationship} {ec.notes ? `· ${ec.notes}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-[#515853]">Emergency contacts hidden for your role.</p>
          )}
        </section>
      </div>

      {/* Category Consent & Visibility Matrix */}
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-[#202522]">
            Who Can View Each HealthVault Category
          </h2>
          <p className="mt-1 text-base text-[#515853]">
            Transparent consent controls owned by {state.profile.preferredName}. Caretakers and family members only see categories explicitly permitted here.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#DDD6C9] text-sm font-bold text-[#515853]">
                <th className="py-3 pr-4">Care Circle Member</th>
                {VAULT_CATEGORY_LABELS.map((cat) => (
                  <th key={cat.key} className="py-3 px-2 text-center">
                    {cat.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD6C9]">
              {state.members
                .filter((m) => m.active)
                .map((member) => (
                  <tr key={member.id}>
                    <td className="py-3 pr-4">
                      <div className="font-bold text-[#202522]">{member.name}</div>
                      <div className="text-sm text-[#515853]">{ROLE_LABELS[member.role]}</div>
                    </td>
                    {VAULT_CATEGORY_LABELS.map((cat) => {
                      const allowed = member.canViewHealthVaultCategories[cat.key];
                      const editable = canManage && member.role !== 'elderly_owner';
                      return (
                        <td key={cat.key} className="py-3 px-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Allow ${member.name} to view ${cat.label}`}
                            checked={allowed}
                            disabled={!editable}
                            onChange={(e) =>
                              onUpdateCategoryConsent(member.id, cat.key, e.target.checked)
                            }
                            className="h-5 w-5 accent-[#B85E47]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
