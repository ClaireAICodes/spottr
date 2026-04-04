// ============================================================
// Spottr — Data Types
// All 8 entities for the normalized Dexie IndexedDB schema.
// ============================================================

export type MediaType = 'image' | 'video';

export type WeightUnit = 'kg' | 'lbs';

/** A gym / training location */
export interface Gym {
  id?: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
}

/** Global exercise definition (library entry) */
export interface ExerciseDefinition {
  id?: number;
  name: string;
  notes?: string;
  createdAt: Date;
}

/** Media attachment for an exercise (image or video) */
export interface ExerciseMedia {
  id?: number;
  exerciseId: number;
  /** Stored directly as a Blob in IndexedDB — no base64 needed */
  mediaBlob: Blob;
  mediaType: MediaType;
  sortOrder: number;
  createdAt: Date;
}

/** Reusable workout template (a "recipe") */
export interface Workout {
  id?: number;
  gymId: number;
  name: string;
  createdAt: Date;
}

/** Links a Workout to an ExerciseDefinition with ordering */
export interface WorkoutExercise {
  id?: number;
  workoutId: number;
  exerciseId: number;
  orderIndex: number;
}

/** Per-set target — each set can have different reps/weight/unit */
export interface WorkoutSetTarget {
  id?: number;
  workoutExerciseId: number;
  /** 1-indexed position within this exercise */
  setNumber: number;
  targetReps: number;
  targetWeight: number;
  targetWeightUnit: WeightUnit;
}

/** A completed (or active) workout session */
export interface WorkoutSession {
  id?: number;
  workoutId: number;
  startTime: Date;
  endTime?: Date;
}

/** Actual set data logged during a session */
export interface SetLog {
  id?: number;
  workoutSessionId: number;
  exerciseId: number;
  /** 1-indexed set position within the session */
  setNumber: number;
  actualWeight: number;
  actualReps: number;
  /** Seconds of rest taken after this set, if tracked */
  restTimeTaken?: number;
  /** True if this weight exceeded the historical max at time of logging */
  isPR: boolean;
  createdAt: Date;
}
