import { type FC, useState, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore, type WeightUnit } from '../store/useAppStore';
import { db } from '../db/schema';
import GlassCard from '../components/common/GlassCard';
import GlassButton from '../components/common/GlassButton';
import GradientText from '../components/common/GradientText';

// ============================================================
// Types
// ============================================================

/** In-memory draft set target for the builder UI */
interface DraftSet {
  /** Negative ID for unsaved sets, positive for existing set target IDs */
  id: number;
  setNumber: number;
  targetReps: number;
  targetWeight: number;
  targetWeightUnit: WeightUnit;
}

/** In-memory draft exercise block in the builder */
interface DraftExerciseBlock {
  /** Negative ID for unsaved, positive for existing WorkoutExercise ID */
  workoutExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  orderIndex: number;
  sets: DraftSet[];
}

/** Full builder state */
interface BuilderDraft {
  workoutId: number | null; /** null = new workout */
  gymId: number | null;
  name: string;
  exercises: DraftExerciseBlock[];
}

// ============================================================
// Hooks
// ============================================================

function useGyms() {
  return useLiveQuery(() => db.gyms.orderBy('name').toArray(), []);
}

function useExercises() {
  return useLiveQuery(() => db.exerciseDefinitions.orderBy('name').toArray(), []);
}

/** Loads existing workout data into draft format for editing */
function useExistingWorkout(id: number | null) {
  return useLiveQuery(async () => {
    if (id == null) return null;
    const workout = await db.workouts.get(id);
    if (!workout) return null;

    const weList = await db.workoutExercises
      .where('workoutId')
      .equals(id)
      .sortBy('orderIndex');

    const exercises: DraftExerciseBlock[] = await Promise.all(
      weList.map(async (we) => {
        const ex = await db.exerciseDefinitions.get(we.exerciseId);
        const targets = await db.workoutSetTargets
          .where('workoutExerciseId')
          .equals(we.id!)
          .sortBy('setNumber');

        return {
          workoutExerciseId: we.id!,
          exerciseId: we.exerciseId,
          exerciseName: ex?.name ?? 'Unknown Exercise',
          orderIndex: we.orderIndex,
          sets: targets.map((t) => ({
            id: t.id!,
            setNumber: t.setNumber,
            targetReps: t.targetReps,
            targetWeight: t.targetWeight,
            targetWeightUnit: t.targetWeightUnit,
          })),
        };
      })
    );

    return {
      workoutId: id,
      gymId: workout.gymId,
      name: workout.name,
      exercises,
    } as BuilderDraft;
  }, [id]);
}

// ============================================================
// Builder Component
// ============================================================

const WorkoutBuilder: FC = () => {
  const editingWorkoutId = useAppStore((s) => s.editingWorkoutId);
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const defaultUnit = useAppStore((s) => s.defaultWeightUnit);

  const existing = useExistingWorkout(editingWorkoutId);
  const gyms = useGyms();
  const exercises = useExercises();

  // Builder state
  const [draft, setDraft] = useState<BuilderDraft>(() => {
    if (existing) return { ...existing };
    return { workoutId: null, gymId: null, name: '', exercises: [] };
  });

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showGymPicker, setShowGymPicker] = useState(false);
  const [searchEx, setSearchEx] = useState('');
  const [searchGym, setSearchGym] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Add an exercise block
  const addExercise = useCallback(
    (exId: number, exName: string) => {
      const maxIdx = draft.exercises.reduce(
        (m, e) => Math.max(m, e.orderIndex),
        -1
      );
      const newBlock: DraftExerciseBlock = {
        workoutExerciseId: -(Math.random() * 1e9), // negative = new
        exerciseId: exId,
        exerciseName: exName,
        orderIndex: maxIdx + 1,
        sets: [
          {
            id: -(Math.random() * 1e9),
            setNumber: 1,
            targetReps: 8,
            targetWeight: 20,
            targetWeightUnit: defaultUnit,
          },
        ],
      };
      setDraft((prev) => ({ ...prev, exercises: [...prev.exercises, newBlock] }));
      setShowExercisePicker(false);
      setSearchEx('');
    },
    [draft.exercises, defaultUnit]
  );

  // Remove exercise block
  const removeExercise = useCallback((weId: number) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises
        .filter((e) => e.workoutExerciseId !== weId)
        .map((e, i) => ({ ...e, orderIndex: i })),
    }));
  }, []);

  // Reorder exercise block
  const moveExercise = useCallback((weId: number, direction: 'up' | 'down') => {
    setDraft((prev) => {
      const idx = prev.exercises.findIndex((e) => e.workoutExerciseId === weId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.exercises.length) return prev;
      const updated = [...prev.exercises];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return {
        ...prev,
        exercises: updated.map((e, i) => ({ ...e, orderIndex: i })),
      };
    });
  }, []);

  // Set operations within an exercise block
  const addSet = useCallback((weId: number, defaultUnit: WeightUnit) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((block) => {
        if (block.workoutExerciseId !== weId) return block;
        const nextNum = block.sets.reduce((m, s) => Math.max(m, s.setNumber), 0) + 1;
        return {
          ...block,
          sets: [
            ...block.sets,
            {
              id: -(Math.random() * 1e9),
              setNumber: nextNum,
              targetReps: 8,
              targetWeight: 20,
              targetWeightUnit: defaultUnit,
            },
          ],
        };
      }),
    }));
  }, []);

  const updateSet = useCallback(
    (weId: number, setId: number, field: keyof DraftSet, value: number | WeightUnit) => {
      setDraft((prev) => ({
        ...prev,
        exercises: prev.exercises.map((block) => {
          if (block.workoutExerciseId !== weId) return block;
          return {
            ...block,
            sets: block.sets.map((s) => {
              if (s.id !== setId) return s;
              return { ...s, [field]: value };
            }),
          };
        }),
      }));
    },
    []
  );

  const removeSet = useCallback((weId: number, setId: number) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((block) => {
        if (block.workoutExerciseId !== weId) return block;
        if (block.sets.length <= 1) return block; // can't delete last set
        const remaining = block.sets.filter((s) => s.id !== setId);
        // Renumber
        const renumbered = remaining.map((s, i) => ({ ...s, setNumber: i + 1 }));
        return { ...block, sets: renumbered };
      }),
    }));
  }, []);

  const moveSet = useCallback((weId: number, setId: number, direction: 'up' | 'down') => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((block) => {
        if (block.workoutExerciseId !== weId) return block;
        const idx = block.sets.findIndex((s) => s.id === setId);
        if (idx < 0) return block;
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= block.sets.length) return block;
        const updated = [...block.sets];
        [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
        return { ...block, sets: updated.map((s, i) => ({ ...s, setNumber: i + 1 })) };
      }),
    }));
  }, []);

  // Save workout
  const handleSave = useCallback(async () => {
    setError(null);

    // Validation
    if (!draft.name.trim()) {
      setError('Workout name is required.');
      return;
    }
    if (!draft.gymId) {
      setError('Please select a gym.');
      return;
    }
    if (draft.exercises.length === 0) {
      setError('Add at least one exercise.');
      return;
    }
    for (const block of draft.exercises) {
      if (block.sets.length === 0) {
        setError(`"${block.exerciseName}" has no sets.`);
        return;
      }
      for (const set of block.sets) {
        if (set.targetReps <= 0 || set.targetWeight <= 0) {
          setError(
            `"${block.exerciseName}" Set ${set.setNumber}: reps and weight must be positive.`
          );
          return;
        }
      }
    }

    try {
      let workoutId: number;

      if (draft.workoutId != null) {
        workoutId = draft.workoutId;
        // Update existing
        await db.workouts.update(workoutId, {
          gymId: draft.gymId!,
          name: draft.name.trim(),
        });

        // Delete old workout exercises and their targets
        const oldWeIds = await db.workoutExercises
          .where('workoutId')
          .equals(workoutId)
          .toArray()
          .then((arr) => arr.map((we) => we.id!));
        for (const weId of oldWeIds) {
          await db.workoutSetTargets.where('workoutExerciseId').equals(weId).delete();
        }
        await db.workoutExercises.where('workoutId').equals(workoutId).delete();

        // Re-insert
        await saveExerciseBlocks(workoutId, draft.exercises);
      } else {
        // Create new
        workoutId = await db.workouts.add({
          gymId: draft.gymId!,
          name: draft.name.trim(),
          createdAt: new Date(),
        });
        await saveExerciseBlocks(workoutId, draft.exercises);
      }

      closeOverlay('workoutBuilder');
    } catch (err: any) {
      setError(`Failed to save: ${err.message}`);
    }
  }, [draft, closeOverlay]);

  // Filtered exercise list for picker
  const filteredExercises = useMemo(() => {
    if (!exercises) return [];
    if (!searchEx.trim()) return exercises;
    const q = searchEx.trim().toLowerCase();
    return exercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [exercises, searchEx]);

  // Filtered gyms for picker
  const filteredGyms = useMemo(() => {
    if (!gyms) return [];
    if (!searchGym.trim()) return gyms;
    const q = searchGym.trim().toLowerCase();
    return gyms.filter((g) => g.name.toLowerCase().includes(q));
  }, [gyms, searchGym]);

  const selectedGym = draft.gymId ? gyms?.find((g) => g.id === draft.gymId) : null;

  // ────── Render ──────

  // Exercise picker overlay
  if (showExercisePicker) {
    return (
      <div className="pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              setShowExercisePicker(false);
              setSearchEx('');
            }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <GradientText as="h2" className="text-xl">Add Exercise</GradientText>
        </div>
        <input
          value={searchEx}
          onChange={(e) => setSearchEx(e.target.value)}
          placeholder="🔍 Search exercises..."
          className="glass-input w-full mb-4"
        />
        {filteredExercises.length === 0 ? (
          <EmptyState icon="🔍" title="No exercises found" />
        ) : (
          <div className="space-y-2">
            {filteredExercises.map((ex) => (
              <GlassCard
                key={ex.id!}
                padded
                className="hover-lift cursor-pointer"
                onClick={() => addExercise(ex.id!, ex.name)}
              >
                <span className="text-white font-medium">{ex.name}</span>
                {ex.notes && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{ex.notes}</p>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Gym picker overlay
  if (showGymPicker) {
    return (
      <div className="pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              setShowGymPicker(false);
              setSearchGym('');
            }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <GradientText as="h2" className="text-xl">Select Gym</GradientText>
        </div>
        <input
          value={searchGym}
          onChange={(e) => setSearchGym(e.target.value)}
          placeholder="🔍 Search gyms..."
          className="glass-input w-full mb-4"
        />
        {filteredGyms.length === 0 ? (
          <GlassButton
            variant="secondary"
            fullWidth
            onClick={() => {
              setShowGymPicker(false);
              // Open gym list from settings (just a notification for now)
              alert('Create a gym first in Settings → Manage Gyms');
            }}
          >
            + Create New Gym
          </GlassButton>
        ) : (
          <div className="space-y-2">
            {filteredGyms.map((gym) => (
              <GlassCard
                key={gym.id!}
                padded
                className={`hover-lift cursor-pointer ${
                  draft.gymId === gym.id ? 'border-accent/40' : ''
                }`}
                onClick={() => {
                  setDraft((prev) => ({ ...prev, gymId: gym.id! }));
                  setShowGymPicker(false);
                  setSearchGym('');
                }}
              >
                <span className="text-white font-medium">{gym.name}</span>
                {gym.address && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{gym.address}</p>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Main builder form
  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => closeOverlay('workoutBuilder')}
          className="text-slate-400 hover:text-white transition-colors"
        >
          ← Cancel
        </button>
        <GradientText as="h2" className="text-2xl">
          {draft.workoutId != null ? 'Edit Workout' : 'Create Workout'}
        </GradientText>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Gym selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Gym <span className="text-red-400">*</span>
        </label>
        {selectedGym ? (
          <GlassCard
            padded
            className="hover-lift cursor-pointer flex items-center justify-between"
            onClick={() => setShowGymPicker(true)}
          >
            <div>
              <span className="text-white font-medium">{selectedGym.name}</span>
              {selectedGym.address && (
                <p className="text-xs text-slate-400 mt-0.5">{selectedGym.address}</p>
              )}
            </div>
            <span className="text-slate-400">✏️</span>
          </GlassCard>
        ) : (
          <GlassButton variant="secondary" fullWidth onClick={() => setShowGymPicker(true)}>
            📍 Select Gym
          </GlassButton>
        )}
      </div>

      {/* Name */}
      <div className="mb-4">
        <label htmlFor="wk-name" className="block text-sm font-medium text-slate-300 mb-1.5">
          Workout Name <span className="text-red-400">*</span>
        </label>
        <input
          id="wk-name"
          type="text"
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g., Push Day - Heavy"
          className="glass-input w-full"
        />
      </div>

      {/* Exercise Blocks */}
      <div className="space-y-4 mb-6">
        {draft.exercises.map((block) => (
          <GlassCard key={block.workoutExerciseId} accentBar="#38bdf8">
            {/* Exercise header with reorder arrows */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveExercise(block.workoutExerciseId, 'up')}
                  className="text-xs text-slate-400 hover:text-white leading-none"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveExercise(block.workoutExerciseId, 'down')}
                  className="text-xs text-slate-400 hover:text-white leading-none"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <h3 className="text-md font-semibold text-white flex-1 truncate">
                {block.exerciseName}
              </h3>
              <button
                onClick={() => removeExercise(block.workoutExerciseId)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                ✕ Remove
              </button>
            </div>

            {/* Set targets */}
            <div className="space-y-2">
              {block.sets.map((set, si) => (
                <div key={set.id} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5 w-5">
                    <button
                      onClick={() => moveSet(block.workoutExerciseId, set.id, 'up')}
                      className="text-[10px] text-slate-500 hover:text-white leading-none"
                      disabled={si === 0}
                      aria-label="Move set up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveSet(block.workoutExerciseId, set.id, 'down')}
                      className="text-[10px] text-slate-500 hover:text-white leading-none"
                      disabled={si === block.sets.length - 1}
                      aria-label="Move set down"
                    >
                      ▼
                    </button>
                  </div>

                  <span className="text-xs text-slate-400 w-12 shrink-0">
                    Set {set.setNumber}
                  </span>

                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      value={set.targetReps}
                      onChange={(e) =>
                        updateSet(
                          block.workoutExerciseId,
                          set.id,
                          'targetReps',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="glass-input w-16 text-center text-sm"
                      aria-label={`Set ${set.setNumber} reps`}
                    />
                    <span className="text-xs text-slate-500">reps</span>
                    <span className="text-slate-600 text-xs">@</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={set.targetWeight}
                      onChange={(e) =>
                        updateSet(
                          block.workoutExerciseId,
                          set.id,
                          'targetWeight',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="glass-input w-16 text-center text-sm"
                      aria-label={`Set ${set.setNumber} weight`}
                    />
                    <select
                      value={set.targetWeightUnit}
                      onChange={(e) =>
                        updateSet(
                          block.workoutExerciseId,
                          set.id,
                          'targetWeightUnit',
                          e.target.value as WeightUnit
                        )
                      }
                      className="glass-input w-14 text-sm text-center"
                      aria-label="Weight unit"
                    >
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>

                  <button
                    onClick={() => removeSet(block.workoutExerciseId, set.id)}
                    disabled={block.sets.length <= 1}
                    className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed w-5 text-center"
                    aria-label={`Remove set ${set.setNumber}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => addSet(block.workoutExerciseId, defaultUnit)}
              className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              + Add Set
            </button>
          </GlassCard>
        ))}
      </div>

      {/* Add Exercise */}
      <GlassButton variant="secondary" fullWidth onClick={() => setShowExercisePicker(true)}>
        + Add Exercise
      </GlassButton>

      {/* Save */}
      <div className="flex gap-3 mt-6">
        <button onClick={handleSave} className="glass-button flex-1">
          {draft.workoutId != null ? 'Save Changes' : 'Create Workout'}
        </button>
        <GlassButton
          variant="secondary"
          onClick={() => closeOverlay('workoutBuilder')}
        >
          Cancel
        </GlassButton>
      </div>
    </div>
  );
};

// ============================================================
// Helper — Save exercise blocks to DB
// ============================================================

async function saveExerciseBlocks(
  workoutId: number,
  blocks: DraftExerciseBlock[]
): Promise<void> {
  for (const block of blocks) {
    const weId = await db.workoutExercises.add({
      workoutId,
      exerciseId: block.exerciseId,
      orderIndex: block.orderIndex,
    });
    for (const set of block.sets) {
      await db.workoutSetTargets.add({
        workoutExerciseId: weId,
        setNumber: set.setNumber,
        targetReps: set.targetReps,
        targetWeight: set.targetWeight,
        targetWeightUnit: set.targetWeightUnit,
      });
    }
  }
}

function EmptyState({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="text-center py-8 text-slate-400">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm">{title}</p>
    </div>
  );
}

export default WorkoutBuilder;
