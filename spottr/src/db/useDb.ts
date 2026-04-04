import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import type {
  Gym,
  ExerciseDefinition,
  ExerciseMedia,
  Workout,
  WorkoutExercise,
  WorkoutSetTarget,
  WorkoutSession,
  SetLog,
} from '../types';

// ============================================================
// Gyms
// ============================================================

export function useGyms() {
  return useLiveQuery(() => db.gyms.orderBy('name').toArray(), []);
}

export function useGym(id: number | undefined) {
  return useLiveQuery(() => (id !== undefined ? db.gyms.get(id) : undefined), [id]);
}

export async function addGym(gym: Omit<Gym, 'id'>): Promise<number> {
  return db.gyms.add(gym);
}

export async function updateGym(id: number, patch: Partial<Gym>): Promise<void> {
  await db.gyms.update(id, patch);
}

export async function deleteGym(id: number): Promise<void> {
  await db.gyms.delete(id);
}

// ============================================================
// Exercise Definitions
// ============================================================

export function useExercises() {
  return useLiveQuery(() => db.exerciseDefinitions.orderBy('name').toArray(), []);
}

export function useExercise(id: number | undefined) {
  return useLiveQuery(() => (id !== undefined ? db.exerciseDefinitions.get(id) : undefined), [id]);
}

export async function addExercise(exercise: Omit<ExerciseDefinition, 'id'>): Promise<number> {
  return db.exerciseDefinitions.add(exercise);
}

export async function updateExercise(id: number, patch: Partial<ExerciseDefinition>): Promise<void> {
  await db.exerciseDefinitions.update(id, patch);
}

export async function deleteExercise(id: number): Promise<void> {
  await db.exerciseDefinitions.delete(id);
}

// ============================================================
// Exercise Media
// ============================================================

export function useExerciseMedia(exerciseId: number | undefined) {
  return useLiveQuery(
    () => (exerciseId !== undefined ? db.exerciseMedia.where('exerciseId').equals(exerciseId).sortBy('sortOrder') : []),
    [exerciseId]
  );
}

export async function addExerciseMedia(media: Omit<ExerciseMedia, 'id'>): Promise<number> {
  return db.exerciseMedia.add(media);
}

export async function deleteExerciseMedia(id: number): Promise<void> {
  await db.exerciseMedia.delete(id);
}

export async function reorderExerciseMedia(
  exerciseId: number,
  newOrder: { id: number; sortOrder: number }[]
): Promise<void> {
  // Validate all items belong to this exercise before reordering
  const existingIds = await db.exerciseMedia.where('id')
    .anyOf(newOrder.map(i => i.id))
    .toArray();
  
  const valid = existingIds.every(m => m.exerciseId === exerciseId);
  if (!valid) {
    throw new Error('Some media items do not belong to this exercise');
  }

  await db.transaction('rw', db.exerciseMedia, async () => {
    for (const item of newOrder) {
      await db.exerciseMedia.update(item.id, { sortOrder: item.sortOrder });
    }
  });
}

// ============================================================
// Workouts
// ============================================================

export function useWorkouts() {
  return useLiveQuery(() => db.workouts.orderBy('name').toArray(), []);
}

export function useWorkoutsByGym(gymId: number | undefined) {
  return useLiveQuery(
    () => (gymId !== undefined ? db.workouts.where('gymId').equals(gymId).sortBy('name') : []),
    [gymId]
  );
}

export function useWorkout(id: number | undefined) {
  return useLiveQuery(() => (id !== undefined ? db.workouts.get(id) : undefined), [id]);
}

/** Full workout with exercises, set targets, and exercise definitions joined */
export async function getWorkoutDetail(workoutId: number): Promise<{
  workout: Workout | undefined;
  exercises: {
    workoutExercise: WorkoutExercise;
    exercise: ExerciseDefinition | undefined;
    targets: WorkoutSetTarget[];
  }[];
}> {
  const workout = await db.workouts.get(workoutId);
  if (!workout) return { workout: undefined, exercises: [] };

  const workoutExercises = await db.workoutExercises
    .where('workoutId')
    .equals(workoutId)
    .sortBy('orderIndex');

  const exercises = await Promise.all(
    workoutExercises.map(async (we) => {
      const [exercise, targets] = await Promise.all([
        db.exerciseDefinitions.get(we.exerciseId),
        db.workoutSetTargets
          .where('workoutExerciseId')
          .equals(we.id!)
          .sortBy('setNumber'),
      ]);
      return { workoutExercise: we, exercise, targets };
    })
  );

  return { workout, exercises };
}

export async function addWorkout(workout: Omit<Workout, 'id'>): Promise<number> {
  return db.workouts.add(workout);
}

export async function updateWorkout(id: number, patch: Partial<Workout>): Promise<void> {
  await db.workouts.update(id, patch);
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.workoutSetTargets, async () => {
    const weIds = (await db.workoutExercises.where('workoutId').equals(id).toArray()).map((we) => we.id!);
    for (const weId of weIds) {
      await db.workoutSetTargets.where('workoutExerciseId').equals(weId).delete();
    }
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
}

// ============================================================
// Workout Exercises
// ============================================================

export async function addWorkoutExercise(we: Omit<WorkoutExercise, 'id'>): Promise<number> {
  return db.workoutExercises.add(we);
}

export async function updateWorkoutExercise(id: number, patch: Partial<WorkoutExercise>): Promise<void> {
  await db.workoutExercises.update(id, patch);
}

// ============================================================
// Workout Set Targets
// ============================================================

export async function addSetTarget(target: Omit<WorkoutSetTarget, 'id'>): Promise<number> {
  return db.workoutSetTargets.add(target);
}

export async function updateSetTarget(id: number, patch: Partial<WorkoutSetTarget>): Promise<void> {
  await db.workoutSetTargets.update(id, patch);
}

export async function deleteSetTarget(id: number): Promise<void> {
  await db.workoutSetTargets.delete(id);
}

/** Bulk-add set targets for a specific workoutExercise */
export async function addSetTargets(
  _workoutExerciseId: number,
  targets: Omit<WorkoutSetTarget, 'id'>[]
): Promise<number[]> {
  return db.workoutSetTargets.bulkAdd(targets);
}

// ============================================================
// Workout Sessions
// ============================================================

export function useSessions() {
  return useLiveQuery(
    () => db.workoutSessions.orderBy('startTime').reverse().toArray(),
    []
  );
}

export function useSession(id: number | undefined) {
  return useLiveQuery(() => (id !== undefined ? db.workoutSessions.get(id) : undefined), [id]);
}

/** Full session with set logs and exercise definitions */
export async function getSessionDetail(sessionId: number): Promise<{
  session: WorkoutSession | undefined;
  logs: {
    log: SetLog;
    exercise: ExerciseDefinition | undefined;
  }[];
}> {
  const session = await db.workoutSessions.get(sessionId);
  if (!session) return { session: undefined, logs: [] };

  const logs = await db.setLogs.where('workoutSessionId').equals(sessionId).sortBy('createdAt');

  const detailedLogs = await Promise.all(
    logs.map(async (log) => ({
      log,
      exercise: await db.exerciseDefinitions.get(log.exerciseId),
    }))
  );

  return { session, logs: detailedLogs };
}

export async function startSession(workoutId: number): Promise<number> {
  return db.workoutSessions.add({
    workoutId,
    startTime: new Date(),
  });
}

export async function endSession(sessionId: number): Promise<void> {
  await db.workoutSessions.update(sessionId, { endTime: new Date() });
}

// ============================================================
// Set Logs
// ============================================================

/** Get recent PRs for the home dashboard */
export function useRecentPRs(limit: number = 5) {
  return useLiveQuery(
    async () => {
      const prLogs = await db.setLogs.toArray().then(logs => logs.filter(l => l.isPR === true).reverse());
      const detailed = await Promise.all(
        prLogs.slice(0, limit).map(async (log) => {
          const exercise = await db.exerciseDefinitions.get(log.exerciseId);
          return { log, exerciseName: exercise?.name ?? 'Unknown' };
        })
      );
      return detailed;
    },
    [limit]
  );
}

export async function logSet(setLog: Omit<SetLog, 'id'>): Promise<number> {
  return db.setLogs.add(setLog);
}

/**
 * Log a set with automatic PR detection.
 * Pass the set log data plus optional workoutExerciseId and setNumber if you want
 * to auto-update the WorkoutSetTarget when a PR is saved.
 *
 * Returns { setId, isPR } so the UI can trigger confetti and the "update template?" prompt.
 */
export async function logSetWithPRDetection(
  setLog: Omit<SetLog, 'id' | 'isPR'>,
  opts?: { workoutExerciseId?: number; setNumber?: number }
): Promise<{ setId: number; isPR: boolean }> {
  // Compute historical max for this exercise
  const allLogs = await db.setLogs.where('exerciseId').equals(setLog.exerciseId).toArray();
  const historicalMax = allLogs.length > 0 ? Math.max(...allLogs.map((l) => l.actualWeight), 0) : 0;
  const isPR = setLog.actualWeight > historicalMax;

  const setId = await logSet({
    ...setLog,
    isPR,
  });

  // Auto-update the WorkoutSetTarget if a PR was hit and we have the reference
  if (isPR && opts?.workoutExerciseId !== undefined && opts?.setNumber !== undefined) {
    const existingTarget = await db.workoutSetTargets
      .where('[workoutExerciseId+setNumber]')
      .equals([opts.workoutExerciseId, opts.setNumber])
      .first();

    if (existingTarget) {
      await db.workoutSetTargets.update(existingTarget.id!, {
        targetWeight: setLog.actualWeight,
        targetReps: setLog.actualReps,
      });
    }
  }

  return { setId, isPR };
}

// ============================================================
// Statistics Helpers
// ============================================================

/** Total workout count this month */
export async function getWorkoutsThisMonth(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sessions = await db.workoutSessions
    .where('startTime')
    .aboveOrEqual(monthStart)
    .toArray();
  return sessions.length;
}

/** Total lifetime PR count */
export async function getTotalPRCount(): Promise<number> {
  const prs = await db.setLogs.toArray();
  return prs.filter(s => s.isPR === true).length;
}

/** Current streak (consecutive weeks with at least one workout) */
export async function getCurrentStreakWeeks(): Promise<number> {
  const sessions = await db.workoutSessions.where('startTime').above(new Date(0)).toArray();
  if (sessions.length === 0) return 0;

  // Group sessions by ISO week
  const weeks = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.startTime);
    const year = d.getUTCFullYear();
    const oneJan = new Date(Date.UTC(year, 0, 1));
    const weekNum = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7);
    weeks.add(`${year}-W${weekNum}`);
  }

  // Count consecutive weeks back from the most recent
  // (we iterate from current date backwards, so sorted not needed)
  let streak = 0;
  let current = new Date();

  for (;;) {
    const year = current.getUTCFullYear();
    const oneJan = new Date(Date.UTC(year, 0, 1));
    const weekNum = Math.ceil(((current.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7);
    const key = `${year}-W${weekNum}`;

    if (weeks.has(key)) {
      streak++;
      current = new Date(current.getTime() - 7 * 86400000); // go back one week
    } else {
      break;
    }
  }

  return streak;
}
