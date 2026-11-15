import {
  Beaker,
  Bell,
  Calendar,
  FileHeart,
  Home,
  Menu,
  Pill,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { AppointmentHubView } from './components/AppointmentHubView';
import { CareOverviewView } from './components/CareOverviewView';
import { CareSenseView } from './components/CareSenseView';
import { DemoLabView } from './components/DemoLabView';
import { FamilyConnectView } from './components/FamilyConnectView';
import { HealthVaultView } from './components/HealthVaultView';
import { MediTrackView } from './components/MediTrackView';
import { NotifyCareView } from './components/NotifyCareView';
import { SeniorSimpleView } from './components/SeniorSimpleView';
import { ROLE_LABELS } from './engine/permissions';
import { useElderShield } from './state/useElderShield';
import type { ActiveTab } from './types/eldershield';

export default function App() {
  const {
    state,
    currentMember,
    activeMemberId,
    setActiveMemberId,
    effectiveNow,
    decisions,
    capabilities,
    storageWarning,
    bannerMessage,
    clearBanner,
    recordMedicationEvent,
    addMedication,
    updateMedication,
    removeMedication,
    addAppointment,
    updateAppointment,
    addCaregiverNote,
    acknowledgeCareNote,
    acknowledgeDecision,
    updateMemberPermissions,
    revokeMemberAccess,
    updateHealthVaultCategoryVisibility,
    createInvitation,
    redeemInvitationPasscode,
    revokeInvitation,
    updateNotificationPreference,
    syncAndProcessOutbox,
    sendTestNotification,
    addEmergencyContact,
    triggerDemoScenario,
    resetDemoState,
    clearSimulatedClock,
  } = useElderShield();

  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [simpleMode, setSimpleMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const navigateTo = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const primaryTopNav: Array<{ id: ActiveTab; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'meditrack', label: 'MediTrack' },
    { id: 'appointments', label: 'Appointments' },
    { id: 'caresense', label: 'CareSense' },
    { id: 'familyconnect', label: 'Family' },
  ];

  const allModules: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Home;
  }> = [
    { id: 'today', label: 'Today Overview', icon: Home },
    { id: 'meditrack', label: 'MediTrack', icon: Pill },
    { id: 'appointments', label: 'AppointmentHub', icon: Calendar },
    { id: 'caresense', label: 'CareSense Engine', icon: ShieldCheck },
    { id: 'familyconnect', label: 'FamilyConnect', icon: Users },
    { id: 'notifycare', label: 'NotifyCare', icon: Bell },
    { id: 'healthvault', label: 'HealthVault', icon: FileHeart },
    { id: 'demolab', label: 'Demo Laboratory', icon: Beaker },
  ];

  return (
    <div className="min-h-screen bg-[#F4F0E7] text-[#202522] pb-24 lg:pb-12">
      {/* Skip to content link for keyboard & screen reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#202522] focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Top Bar Contract: Strictly 3 zones — Wordmark | 5 Single-Line Links | 1 Primary Action */}
      <header className="sticky top-0 z-30 border-b border-[#DDD6C9] bg-[#F4F0E7]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('today')}
            className="font-display text-2xl font-bold tracking-tight text-[#202522] whitespace-nowrap shrink-0 text-left"
          >
            ElderShield
          </button>

          {/* Zone 2: 5 concise single-line text nav links (Desktop/Laptop) */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6">
            {primaryTopNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`py-2 text-base font-semibold whitespace-nowrap shrink-0 border-b-2 es-transition ${
                  activeTab === item.id
                    ? 'border-[#B85E47] text-[#B85E47]'
                    : 'border-transparent text-[#202522] hover:text-[#9C4934]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action (Desktop: Open Demo Lab | Mobile: Menu Drawer Toggle) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('demolab')}
              className="hidden sm:inline-flex touch-target items-center rounded-lg bg-[#B85E47] px-4 py-2 text-base font-bold text-white hover:bg-[#9C4934] whitespace-nowrap shrink-0 es-transition"
            >
              Demo Lab
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="lg:hidden touch-target inline-flex items-center justify-center rounded-lg border border-[#DDD6C9] bg-[#FAF8F3] px-3 py-2 text-[#202522]"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile / Tablet Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-[#DDD6C9] bg-[#FAF8F3] px-4 py-4">
          <nav aria-label="Mobile module menu" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => navigateTo(mod.id)}
                  className={`touch-target flex items-center gap-3 rounded-lg px-4 py-3 text-left text-base font-semibold ${
                    activeTab === mod.id
                      ? 'bg-[#B85E47] text-white'
                      : 'bg-[#F4F0E7] text-[#202522] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{mod.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Workspace Toolbar: Secondary Module Rail + Demo Role Switcher + Simple/Full Toggle */}
      <div className="border-b border-[#DDD6C9] bg-[#EFEAE0]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          {/* Secondary Module Switcher on Desktop */}
          <div className="hidden lg:flex items-center gap-2 overflow-x-auto">
            {allModules.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => navigateTo(mod.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 es-transition ${
                  activeTab === mod.id
                    ? 'bg-[#202522] text-[#FAF8F3]'
                    : 'text-[#202522] hover:bg-[#DDD6C9]'
                }`}
              >
                {mod.label}
              </button>
            ))}
          </div>

          {/* Evaluator Role Switcher & Simple Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-[#515853] whitespace-nowrap">
                Demo Role:
              </span>
              <select
                aria-label="Switch demonstration user role"
                value={activeMemberId}
                onChange={(e) => setActiveMemberId(e.target.value)}
                className="min-h-[40px] rounded-lg border border-[#DDD6C9] bg-[#FAF8F3] px-3 py-1.5 text-sm font-bold text-[#202522]"
              >
                {state.members
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({ROLE_LABELS[m.role]})
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setSimpleMode((v) => !v);
                setActiveTab('today');
              }}
              aria-pressed={simpleMode}
              className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 text-sm font-bold whitespace-nowrap shrink-0 es-transition ${
                simpleMode
                  ? 'border-[#202522] bg-[#202522] text-white'
                  : 'border-[#DDD6C9] bg-[#FAF8F3] text-[#202522] hover:bg-white'
              }`}
            >
              {simpleMode ? 'Senior Simple View: ON' : 'Switch to Senior Simple View'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Honest Mode Banner */}
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-[#DDD6C9] bg-[#FAF8F3] px-5 py-3 text-sm text-[#515853] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-[#202522]">
              {capabilities.supabaseConfigured
                ? 'Configured Backend Mode'
                : 'Local Demonstration Mode (Fictional Care Records)'}
            </strong>{' '}
            · Role switching is for evaluation; real passcode hashing & notification processing run on{' '}
            <span className="font-mono-data">/api/*</span>. Email:{' '}
            <strong className="text-[#202522]">{capabilities.emailProviderName}</strong>.
          </div>
          {state.simulatedNowIso && (
            <button
              type="button"
              onClick={clearSimulatedClock}
              className="font-semibold text-[#9C4934] underline text-left sm:text-right whitespace-nowrap"
            >
              Clock: {effectiveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Reset)
            </button>
          )}
        </div>

        {/* Storage Warning or Action Feedback Banner */}
        {storageWarning && (
          <div className="mb-6 rounded-xl border border-[#654513]/40 bg-[#F6ECD9] p-4 text-base text-[#654513]">
            {storageWarning}
          </div>
        )}

        {bannerMessage && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 text-base ${
              bannerMessage.type === 'error'
                ? 'border-[#A94B45] bg-[#F6E6E5] text-[#7F2D28]'
                : bannerMessage.type === 'success'
                ? 'border-[#344737] bg-[#E7ECE7] text-[#344737]'
                : 'border-[#DDD6C9] bg-[#FAF8F3] text-[#202522]'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={clearBanner}
              className="touch-target px-3 text-sm font-bold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${simpleMode ? 'simple' : activeTab}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {simpleMode && activeTab === 'today' ? (
              <SeniorSimpleView
                state={state}
                currentMember={currentMember}
                effectiveNow={effectiveNow}
                decisions={decisions}
                onRecordMedication={recordMedicationEvent}
                onAcknowledgeDecision={acknowledgeDecision}
                onOpenTab={(tab) => {
                  setSimpleMode(false);
                  setActiveTab(tab);
                }}
              />
            ) : activeTab === 'today' ? (
              <CareOverviewView
                state={state}
                currentMember={currentMember}
                effectiveNow={effectiveNow}
                decisions={decisions}
                onRecordMedication={recordMedicationEvent}
                onAcknowledgeDecision={acknowledgeDecision}
                onNavigate={navigateTo}
              />
            ) : activeTab === 'meditrack' ? (
              <MediTrackView
                state={state}
                currentMember={currentMember}
                effectiveNow={effectiveNow}
                onRecordMedication={recordMedicationEvent}
                onAddMedication={addMedication}
                onUpdateMedication={updateMedication}
                onRemoveMedication={removeMedication}
              />
            ) : activeTab === 'appointments' ? (
              <AppointmentHubView
                state={state}
                currentMember={currentMember}
                effectiveNow={effectiveNow}
                onAddAppointment={addAppointment}
                onUpdateAppointment={updateAppointment}
              />
            ) : activeTab === 'caresense' ? (
              <CareSenseView
                state={state}
                currentMember={currentMember}
                effectiveNow={effectiveNow}
                decisions={decisions}
                onAcknowledgeDecision={acknowledgeDecision}
                onSyncAndProcessOutbox={syncAndProcessOutbox}
                onClearSimulatedClock={clearSimulatedClock}
              />
            ) : activeTab === 'familyconnect' ? (
              <FamilyConnectView
                state={state}
                currentMember={currentMember}
                onAddCaregiverNote={addCaregiverNote}
                onAcknowledgeCareNote={acknowledgeCareNote}
                onUpdateMemberPermissions={updateMemberPermissions}
                onRevokeMemberAccess={revokeMemberAccess}
                onCreateInvitation={createInvitation}
                onRedeemPasscode={redeemInvitationPasscode}
                onRevokeInvitation={revokeInvitation}
              />
            ) : activeTab === 'notifycare' ? (
              <NotifyCareView
                state={state}
                currentMember={currentMember}
                capabilities={capabilities}
                onUpdatePreference={updateNotificationPreference}
                onSyncAndProcessOutbox={syncAndProcessOutbox}
                onSendTestNotification={sendTestNotification}
              />
            ) : activeTab === 'healthvault' ? (
              <HealthVaultView
                state={state}
                currentMember={currentMember}
                onAddEmergencyContact={addEmergencyContact}
                onUpdateCategoryConsent={updateHealthVaultCategoryVisibility}
              />
            ) : (
              <DemoLabView
                state={state}
                effectiveNow={effectiveNow}
                decisions={decisions}
                onTriggerScenario={triggerDemoScenario}
                onSyncAndProcessOutbox={syncAndProcessOutbox}
                onResetDemo={resetDemoState}
                onOpenCareSense={() => navigateTo('caresense')}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tab Bar (Thumb Zone Ergonomics, compact height <= 64px) */}
      <nav
        aria-label="Mobile quick navigation"
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[#DDD6C9] bg-[#FAF8F3]/95 backdrop-blur-sm lg:hidden"
      >
        {(
          [
            ['today', 'Today', Home],
            ['meditrack', 'Meds', Pill],
            ['appointments', 'Visits', Calendar],
            ['caresense', 'CareSense', ShieldCheck],
            ['familyconnect', 'Family', Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => navigateTo(id)}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold ${
              activeTab === id ? 'text-[#B85E47]' : 'text-[#515853]'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate max-w-full">{label}</span>
          </button>
        ))}
      </nav>

      {/* Clean Editorial Footer */}
      <footer className="mx-auto mt-12 max-w-7xl border-t border-[#DDD6C9] px-4 py-6 text-sm text-[#515853] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>ElderShield</strong> — Your health. Your family. One connected circle of care.
          </p>
          <p>
            Demonstration records only · Not a certified medical record or emergency dispatch service.
          </p>
        </div>
      </footer>
    </div>
  );
}
