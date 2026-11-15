import { createDemoSeedState } from '../data/demoSeed';
import type { ElderShieldState } from '../types/eldershield';

const STORAGE_KEY = 'eldershield_demo_state_v2';

export function loadElderShieldState(): { state: ElderShieldState; storageWarning: string | null } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createDemoSeedState(), storageWarning: null };
    }
    const parsed = JSON.parse(raw) as ElderShieldState;
    if (!parsed || !parsed.profile || !Array.isArray(parsed.medications)) {
      return {
        state: createDemoSeedState(),
        storageWarning: 'Saved demo data was reset due to an unexpected format.',
      };
    }
    return { state: parsed, storageWarning: null };
  } catch {
    return {
      state: createDemoSeedState(),
      storageWarning: 'Browser local storage is unavailable; changes will remain in memory for this session.',
    };
  }
}

export function saveElderShieldState(state: ElderShieldState): string | null {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return 'Unable to persist demo state to browser local storage (storage quota or private mode).';
  }
}

export function clearElderShieldState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage removal errors in restricted environments
  }
}
