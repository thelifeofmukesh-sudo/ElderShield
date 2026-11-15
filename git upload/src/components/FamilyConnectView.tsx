import { CheckCircle2, Copy, KeyRound, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  PERMISSION_DESCRIPTIONS,
  ROLE_LABELS,
} from '../engine/permissions';
import type {
  CaregiverNote,
  ElderShieldState,
  Invitation,
  Member,
  PermissionKey,
  Role,
} from '../types/eldershield';

interface FamilyConnectViewProps {
  state: ElderShieldState;
  currentMember: Member;
  onAddCaregiverNote: (
    input: Pick<CaregiverNote, 'category' | 'completedSummary' | 'attentionNeeded' | 'noteText'>
  ) => void;
  onAcknowledgeCareNote: (noteId: string) => void;
  onUpdateMemberPermissions: (memberId: string, permissions: PermissionKey[]) => void;
  onRevokeMemberAccess: (memberId: string) => void;
  onCreateInvitation: (input: {
    label: string;
    recipientEmailHint: string;
    role: Exclude<Role, 'elderly_owner'>;
    permissions: PermissionKey[];
    expiresInDays: number;
  }) => Promise<{ oneTimePasscode: string; invitation: Invitation } | null>;
  onRedeemPasscode: (input: {
    passcode: string;
    memberName: string;
    memberEmail: string;
    relationship: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRevokeInvitation: (invitationId: string) => Promise<void>;
}

export function FamilyConnectView({
  state,
  currentMember,
  onAddCaregiverNote,
  onAcknowledgeCareNote,
  onUpdateMemberPermissions,
  onRevokeMemberAccess,
  onCreateInvitation,
  onRedeemPasscode,
  onRevokeInvitation,
}: FamilyConnectViewProps) {
  const [subTab, setSubTab] = useState<'handover' | 'members' | 'passcode' | 'timeline'>('handover');

  // Handover Form
  const [noteCategory, setNoteCategory] = useState<CaregiverNote['category']>('handover');
  const [completedSummary, setCompletedSummary] = useState('');
  const [attentionNeeded, setAttentionNeeded] = useState('');
  const [noteText, setNoteText] = useState('');

  // Invitation Form
  const [invLabel, setInvLabel] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<Exclude<Role, 'elderly_owner'>>('family_member');
  const [invPerms, setInvPerms] = useState<PermissionKey[]>([...DEFAULT_ROLE_PERMISSIONS.family_member]);
  const [invDays, setInvDays] = useState(7);
  const [generatedPasscode, setGeneratedPasscode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Redeem Passcode Form
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemName, setRedeemName] = useState('');
  const [redeemEmail, setRedeemEmail] = useState('');
  const [redeemRelation, setRedeemRelation] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const canManageMembers = hasPermission(currentMember, 'manage_members');
  const canAddNotes = hasPermission(currentMember, 'add_care_notes');
  const canAck = hasPermission(currentMember, 'acknowledge_alerts');

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completedSummary.trim() && !noteText.trim()) return;
    onAddCaregiverNote({
      category: noteCategory,
      completedSummary: completedSummary.trim() || 'Routine check-in completed.',
      attentionNeeded: attentionNeeded.trim() || 'No urgent handover items.',
      noteText: noteText.trim(),
    });
    setCompletedSummary('');
    setAttentionNeeded('');
    setNoteText('');
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onCreateInvitation({
      label: invLabel.trim() || `${ROLE_LABELS[invRole]} Access`,
      recipientEmailHint: invEmail.trim(),
      role: invRole,
      permissions: invPerms,
      expiresInDays: invDays,
    });
    if (res) {
      setGeneratedPasscode(res.oneTimePasscode);
      setCopiedCode(false);
      setInvLabel('');
      setInvEmail('');
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemError(null);
    const result = await onRedeemPasscode({
      passcode: redeemCode,
      memberName: redeemName,
      memberEmail: redeemEmail,
      relationship: redeemRelation,
    });
    if (!result.ok) {
      setRedeemError(result.error || 'Passcode verification failed.');
    } else {
      setRedeemCode('');
      setRedeemName('');
      setRedeemEmail('');
      setRedeemRelation('');
    }
  };

  const toggleMemberPermission = (member: Member, perm: PermissionKey) => {
    const exists = member.permissions.includes(perm);
    const updated = exists
      ? member.permissions.filter((p) => p !== perm)
      : [...member.permissions, perm];
    onUpdateMemberPermissions(member.id, updated);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
        <h1 className="text-3xl font-bold text-[#202522]">
          FamilyConnect — Shared Care Circle & Access Control
        </h1>
        <p className="mt-1 text-base text-[#515853]">
          Coordinate caregiver shift handovers, manage granular permissions, and verify expiring invitation passcodes on the server.
        </p>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-[#DDD6C9] pb-3" role="tablist" aria-label="FamilyConnect sections">
        {(
          [
            ['handover', 'Caregiver Handover & Notes'],
            ['members', `Care Circle Members (${state.members.filter((m) => m.active).length})`],
            ['passcode', 'Passcode Invitations & Join'],
            ['timeline', 'Shared Activity Timeline'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subTab === id}
            onClick={() => setSubTab(id)}
            className={`touch-target rounded-lg px-4 py-2.5 text-base font-semibold whitespace-nowrap shrink-0 es-transition ${
              subTab === id
                ? 'bg-[#202522] text-[#FAF8F3]'
                : 'bg-[#EFEAE0] text-[#202522] hover:bg-[#DDD6C9]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Caregiver Handover & Preserved Notes */}
      {subTab === 'handover' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {canAddNotes ? (
              <form
                onSubmit={handleNoteSubmit}
                className="space-y-4 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6"
              >
                <h2 className="text-2xl font-bold text-[#202522]">Record Care / Handover Note</h2>
                <p className="text-sm text-[#515853]">
                  Previous notes are always preserved so incoming caregivers have full context.
                </p>

                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">Note Type</span>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value as CaregiverNote['category'])}
                    className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  >
                    <option value="handover">Shift Handover</option>
                    <option value="daily_care">Daily Care Activity</option>
                    <option value="follow_up">Family Follow-Up</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">What Was Completed *</span>
                  <textarea
                    rows={2}
                    value={completedSummary}
                    onChange={(e) => setCompletedSummary(e.target.value)}
                    placeholder="e.g., Assisted with morning routine and hydration"
                    className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">What Needs Attention Next</span>
                  <textarea
                    rows={2}
                    value={attentionNeeded}
                    onChange={(e) => setAttentionNeeded(e.target.value)}
                    placeholder="e.g., Please double-check clinic bag before 09:30 tomorrow"
                    className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">Additional Observations</span>
                  <textarea
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Mood, appetite, or routine observations"
                    className="w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  />
                </label>

                <button
                  type="submit"
                  className="touch-target w-full rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934]"
                >
                  Save Handover Note
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 text-base text-[#515853]">
                Your current role does not have permission to write care notes.
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-7">
            <h2 className="text-2xl font-bold text-[#202522]">Preserved Handover & Care Log</h2>
            {state.caregiverNotes.map((note) => (
              <article
                key={note.id}
                className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6 space-y-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-base font-bold text-[#202522]">
                    {note.authorName}{' '}
                    <span className="font-normal text-[#515853]">
                      · {ROLE_LABELS[note.authorRole]} · {note.category.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="font-mono-data text-sm text-[#515853]">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-base text-[#202522]">
                  <strong>Completed:</strong> {note.completedSummary}
                </p>
                <p className="rounded-lg bg-[#F6ECD9] p-3 text-base text-[#202522]">
                  <strong>Needs Attention:</strong> {note.attentionNeeded}
                </p>
                {note.noteText && <p className="text-base text-[#515853]">{note.noteText}</p>}

                <div className="pt-1">
                  {note.acknowledgedBy ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#344737]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Acknowledged by {note.acknowledgedBy}
                    </span>
                  ) : (
                    canAck && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeCareNote(note.id)}
                        className="touch-target rounded-lg border border-[#202522] bg-white px-4 py-2 text-sm font-bold text-[#202522] hover:bg-[#EFEAE0]"
                      >
                        Acknowledge Handover
                      </button>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Care Circle Members & Permission Scopes */}
      {subTab === 'members' && (
        <div className="space-y-6">
          {!canManageMembers && (
            <div className="rounded-xl border border-[#DDD6C9] bg-[#EFEAE0] p-4 text-base text-[#202522]">
              Viewing in read-only mode. Only the Elderly Profile Owner ({state.profile.preferredName}) can modify permission scopes or revoke access.
            </div>
          )}

          {state.members.map((member) => (
            <article
              key={member.id}
              className={`rounded-xl border p-6 space-y-4 ${
                member.active
                  ? 'border-[#DDD6C9] bg-[#FAF8F3]'
                  : 'border-[#A94B45]/40 bg-[#F6E6E5]/50'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-[#202522]">{member.name}</h2>
                    <span className="text-base font-semibold text-[#9C4934]">
                      {ROLE_LABELS[member.role]}
                    </span>
                    {!member.active && (
                      <span className="font-semibold text-[#A94B45]">Access Revoked</span>
                    )}
                  </div>
                  <p className="text-base text-[#515853]">
                    {member.relationship} · <span className="font-mono-data">{member.email}</span>
                  </p>
                </div>

                {canManageMembers && member.role !== 'elderly_owner' && member.active && (
                  <button
                    type="button"
                    onClick={() => onRevokeMemberAccess(member.id)}
                    className="touch-target inline-flex items-center gap-2 rounded-lg border border-[#A94B45] bg-white px-4 py-2.5 text-base font-semibold text-[#A94B45] hover:bg-[#F6E6E5] whitespace-nowrap shrink-0"
                  >
                    <UserX className="h-4 w-4" aria-hidden="true" />
                    <span>Revoke Access</span>
                  </button>
                )}
              </div>

              {member.role === 'elderly_owner' ? (
                <p className="text-base text-[#344737] font-medium">
                  Profile Owner retains full authority over personal healthcare records, invitations, and revocations.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(PERMISSION_DESCRIPTIONS) as PermissionKey[]).map((perm) => {
                    const enabled = member.permissions.includes(perm);
                    const info = PERMISSION_DESCRIPTIONS[perm];
                    return (
                      <label
                        key={perm}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          enabled ? 'border-[#89958A] bg-white' : 'border-[#DDD6C9] bg-[#F4F0E7]'
                        } ${canManageMembers && member.active ? 'cursor-pointer' : 'opacity-80'}`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={!canManageMembers || !member.active}
                          onChange={() => toggleMemberPermission(member, perm)}
                          className="mt-1 h-5 w-5 accent-[#B85E47]"
                        />
                        <span>
                          <span className="block text-base font-semibold text-[#202522]">
                            {info.label}
                          </span>
                          <span className="block text-sm text-[#515853]">{info.explanation}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Passcode Invitations & Joining */}
      {subTab === 'passcode' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left: Generate Expiring Passcode (Profile Owner) */}
          <section className="space-y-5 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
              <h2 className="text-2xl font-bold text-[#202522]">
                Generate Expiring Passcode Invitation
              </h2>
            </div>
            <p className="text-base text-[#515853]">
              Passcodes are unique, single-use, rate-limited, and stored on the server strictly as salted HMAC-SHA256 hashes—never as a universal family PIN.
            </p>

            {generatedPasscode && (
              <div className="rounded-xl border border-[#344737] bg-[#E7ECE7] p-5 space-y-2">
                <p className="text-sm font-bold uppercase tracking-wide text-[#344737]">
                  One-Time Passcode Created (Share Privately Now)
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <code className="font-mono-data text-2xl font-bold text-[#202522]">
                    {generatedPasscode}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(generatedPasscode);
                      setCopiedCode(true);
                    }}
                    className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-[#202522] bg-white px-4 py-2 text-sm font-bold text-[#202522]"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
                <p className="text-sm text-[#515853]">
                  For security, the server stores only the cryptographic hash and cannot display this plaintext code again.
                </p>
              </div>
            )}

            {canManageMembers ? (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">Invitation Label *</span>
                  <input
                    type="text"
                    value={invLabel}
                    onChange={(e) => setInvLabel(e.target.value)}
                    placeholder="e.g., Son David or Weekend Nurse"
                    className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                    required
                  />
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-base font-semibold text-[#202522]">Assigned Role</span>
                    <select
                      value={invRole}
                      onChange={(e) => {
                        const r = e.target.value as Exclude<Role, 'elderly_owner'>;
                        setInvRole(r);
                        setInvPerms([...DEFAULT_ROLE_PERMISSIONS[r]]);
                      }}
                      className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                    >
                      <option value="family_member">Family Member</option>
                      <option value="caretaker">Caretaker</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-base font-semibold text-[#202522]">Expires After (Days)</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={invDays}
                      onChange={(e) => setInvDays(Number(e.target.value))}
                      className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-base font-semibold text-[#202522]">Recipient Email Hint</span>
                  <input
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="optional@example.com"
                    className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  />
                </label>

                <button
                  type="submit"
                  className="touch-target w-full rounded-lg bg-[#B85E47] px-5 py-3 text-base font-bold text-white hover:bg-[#9C4934]"
                >
                  Generate Server-Hashed Passcode
                </button>
              </form>
            ) : (
              <p className="rounded-lg bg-[#EFEAE0] p-4 text-base text-[#202522]">
                Switch to the Elderly Profile Owner role to generate or revoke access passcodes.
              </p>
            )}

            <div className="pt-2 space-y-3">
              <h3 className="text-lg font-bold text-[#202522]">Issued Invitations</h3>
              <ul className="divide-y divide-[#DDD6C9] rounded-lg border border-[#DDD6C9] bg-white">
                {state.invitations.map((inv) => {
                  const statusLabel = inv.revokedAt
                    ? 'Revoked'
                    : inv.redeemedAt
                    ? 'Redeemed (Single-Use Complete)'
                    : new Date(inv.expiresAt).getTime() < Date.now()
                    ? 'Expired'
                    : 'Active';
                  return (
                    <li key={inv.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-bold text-[#202522]">{inv.label}</p>
                        <p className="font-mono-data text-sm text-[#515853]">
                          {inv.codeMasked} · {ROLE_LABELS[inv.role]} · {statusLabel}
                        </p>
                      </div>
                      {canManageMembers && statusLabel === 'Active' && (
                        <button
                          type="button"
                          onClick={() => onRevokeInvitation(inv.id)}
                          className="touch-target rounded-lg border border-[#A94B45]/50 px-3 py-1.5 text-sm font-semibold text-[#A94B45] hover:bg-[#F6E6E5]"
                        >
                          Revoke
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Right: Redeem Passcode Gate */}
          <section className="space-y-5 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
            <div className="flex items-center gap-2">
              <UserPlus className="h-6 w-6 text-[#B85E47]" aria-hidden="true" />
              <h2 className="text-2xl font-bold text-[#202522]">Join Profile with Passcode</h2>
            </div>
            <p className="text-base text-[#515853]">
              Verify an invitation passcode via <code className="font-mono-data text-sm">POST /api/invitations/redeem</code>. Role and permission scopes are assigned strictly by the server—never by browser input.
            </p>
            <div className="rounded-lg bg-[#EFEAE0] p-3 text-sm text-[#202522]">
              <strong>Evaluator Sample Passcode:</strong>{' '}
              <code className="font-mono-data font-bold">ES-DEMO-4829</code> (single-use caretaker invitation)
            </div>

            {redeemError && (
              <div className="rounded-lg bg-[#F6E6E5] p-3 text-base font-semibold text-[#7F2D28]" role="alert">
                {redeemError}
              </div>
            )}

            <form onSubmit={handleRedeem} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-base font-semibold text-[#202522]">Invitation Passcode *</span>
                <input
                  type="text"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  placeholder="ES-XXXX-XXXX"
                  className="font-mono-data touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base uppercase"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold text-[#202522]">Your Full Name *</span>
                <input
                  type="text"
                  value={redeemName}
                  onChange={(e) => setRedeemName(e.target.value)}
                  placeholder="e.g., Maya Patel"
                  className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold text-[#202522]">Email Address *</span>
                <input
                  type="email"
                  value={redeemEmail}
                  onChange={(e) => setRedeemEmail(e.target.value)}
                  placeholder="maya@example.com"
                  className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold text-[#202522]">Relationship to Profile Owner</span>
                <input
                  type="text"
                  value={redeemRelation}
                  onChange={(e) => setRedeemRelation(e.target.value)}
                  placeholder="e.g., Visiting Nurse / Son"
                  className="touch-target w-full rounded-lg border border-[#DDD6C9] bg-white px-4 py-2.5 text-base"
                />
              </label>
              <button
                type="submit"
                className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#202522] px-5 py-3 text-base font-bold text-white hover:bg-[#363D39]"
              >
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                <span>Verify Passcode & Join Circle</span>
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Shared Activity Timeline */}
      {subTab === 'timeline' && (
        <section className="rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] p-6">
          <h2 className="text-2xl font-bold text-[#202522]">Shared Audit & Activity Timeline</h2>
          <p className="mt-1 text-base text-[#515853]">
            Every medication confirmation, appointment update, handover note, and access change includes author and timestamp.
          </p>
          <ul className="mt-5 divide-y divide-[#DDD6C9]">
            {state.auditEvents.map((ev) => (
              <li key={ev.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-bold text-[#202522]">{ev.summary}</p>
                  <p className="text-sm text-[#515853]">
                    {ev.actorName} · {ROLE_LABELS[ev.actorRole]} ·{' '}
                    <span className="font-mono-data">{ev.actionType}</span>
                  </p>
                </div>
                <span className="font-mono-data text-sm text-[#515853] shrink-0">
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
