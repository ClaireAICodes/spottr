import { create } from 'zustand';

// ============================================================
// Types
// ============================================================

export type TabKey = 'home' | 'library' | 'workouts' | 'history' | 'settings';
export type WeightUnit = 'kg' | 'lbs';

export interface OverlayKeyMap {
  gymList: boolean;
  gymEditor: boolean;
  exerciseEditor: boolean;
  workoutBuilder: boolean;
  workoutExecution: boolean;
}

// ============================================================
// Store
// ============================================================

interface AppState {
  // ── Navigation ──
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;

  // ── App Settings (persisted to localStorage) ──
  defaultWeightUnit: WeightUnit;
  setDefaultWeightUnit: (unit: WeightUnit) => void;
  progressiveOverloadEnabled: boolean;
  setProgressiveOverloadEnabled: (enabled: boolean) => void;
  prCelebrationEnabled: boolean;
  setPrCelebrationEnabled: (enabled: boolean) => void;

  // ── UI State ──
  editingGymId: number | null;
  setEditingGymId: (id: number | null) => void;
  editingExerciseId: number | null;
  setEditingExerciseId: (id: number | null) => void;
  editingWorkoutId: number | null;
  setEditingWorkoutId: (id: number | null) => void;

  // ── Overlays ──
  overlays: OverlayKeyMap;
  openOverlay: (overlay: keyof OverlayKeyMap) => void;
  closeOverlay: (overlay: keyof OverlayKeyMap) => void;
  closeAllOverlays: () => void;
}

// Load persisted settings
function loadWeightUnit(): WeightUnit {
  try {
    const stored = localStorage.getItem('spottr-weight-unit');
    if (stored === 'lbs') return 'lbs';
  } catch { /* ignore */ }
  return 'kg';
}

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(`spottr-${key}`);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }
  return fallback;
}

function saveWeightUnit(unit: WeightUnit) {
  try { localStorage.setItem('spottr-weight-unit', unit); } catch { /* ignore */ }
}

function saveBoolean(key: string, value: boolean) {
  try { localStorage.setItem(`spottr-${key}`, `${value}`); } catch { /* ignore */ }
}

// ============================================================
// Create Store
// ============================================================

export const useAppStore = create<AppState>((set) => ({
  // ── Navigation ──
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── App Settings ──
  defaultWeightUnit: loadWeightUnit(),
  setDefaultWeightUnit: (unit) => {
    saveWeightUnit(unit);
    set({ defaultWeightUnit: unit });
  },
  progressiveOverloadEnabled: loadBoolean('progressive-overload', true),
  setProgressiveOverloadEnabled: (enabled) => {
    saveBoolean('progressive-overload', enabled);
    set({ progressiveOverloadEnabled: enabled });
  },
  prCelebrationEnabled: loadBoolean('pr-celebration', true),
  setPrCelebrationEnabled: (enabled) => {
    saveBoolean('pr-celebration', enabled);
    set({ prCelebrationEnabled: enabled });
  },

  // ── Edit Context ──
  editingGymId: null,
  setEditingGymId: (id) => set({ editingGymId: id }),
  editingExerciseId: null,
  setEditingExerciseId: (id) => set({ editingExerciseId: id }),
  editingWorkoutId: null,
  setEditingWorkoutId: (id) => set({ editingWorkoutId: id }),

  // ── Overlays ──
  overlays: {
    gymList: false,
    gymEditor: false,
    exerciseEditor: false,
    workoutBuilder: false,
    workoutExecution: false,
  },
  openOverlay: (overlay) => set((state) => ({
    overlays: { ...state.overlays, [overlay]: true },
  })),
  closeOverlay: (overlay) => set((state) => ({
    overlays: { ...state.overlays, [overlay]: false },
  })),
  closeAllOverlays: () => set({ overlays: { gymList: false, gymEditor: false, exerciseEditor: false, workoutBuilder: false, workoutExecution: false } }),
}));
