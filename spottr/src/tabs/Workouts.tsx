import { type FC, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useAppStore } from '../store/useAppStore';
import GlassCard from '../components/common/GlassCard';
import GlassButton from '../components/common/GlassButton';
import EmptyState from '../components/common/EmptyState';
import GradientText from '../components/common/GradientText';

/** Live-enriched workout data: workouts with gym name, exercise count, and set count */
function useEnrichedWorkouts() {
  return useLiveQuery(async () => {
    const workouts = await db.workouts.orderBy('name').toArray();
    if (!workouts.length) return [];

    const gymCache = new Map<number, string>();
    const results = await Promise.all(
      workouts.map(async (w) => {
        if (!gymCache.has(w.gymId)) {
          const g = await db.gyms.get(w.gymId);
          gymCache.set(w.gymId, g?.name ?? 'Unknown gym');
        }
        const exCount = await db.workoutExercises.where('workoutId').equals(w.id!).count();
        const weIds = await db.workoutExercises
          .where('workoutId')
          .equals(w.id!)
          .toArray()
          .then((arr) => arr.map((we) => we.id!));
        let setCount = 0;
        for (const weId of weIds) {
          setCount += await db.workoutSetTargets.where('workoutExerciseId').equals(weId).count();
        }
        return { workout: w, gymName: gymCache.get(w.gymId) ?? 'Unknown gym', exCount, setCount };
      })
    );
    return results;
  }, []);
}

// ============================================================
// Workout Card
// ============================================================

function WorkoutCard({
  workout,
  gymName,
  exerciseCount,
  setCount,
  onEdit,
  onDelete,
}: {
  workout: any;
  gymName: string;
  exerciseCount: number;
  setCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard padded className="relative group" hover>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{workout.name}</h3>
          <p className="text-sm text-slate-400 mt-0.5">📍 {gymName}</p>
          <p className="text-xs text-slate-500 mt-2">
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''} • {setCount} set{setCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="w-8 h-8 rounded-full bg-white/10 text-xs flex items-center justify-center hover:bg-white/20"
            aria-label={`Edit ${workout.name}`}
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-8 h-8 rounded-full bg-red-500/20 text-xs flex items-center justify-center hover:bg-red-500/30"
            aria-label={`Delete ${workout.name}`}
          >
            🗑️
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// ============================================================
// Workout List — Main Screen
// ============================================================

const WorkoutList: FC = () => {
  const items = useEnrichedWorkouts();
  const setEditingWorkoutId = useAppStore((s) => s.setEditingWorkoutId);
  const openOverlay = useAppStore((s) => s.openOverlay);

  const handleEdit = useCallback(
    (id: number) => {
      setEditingWorkoutId(id);
      openOverlay('workoutBuilder');
    },
    [setEditingWorkoutId, openOverlay]
  );

  const handleAdd = useCallback(() => {
    setEditingWorkoutId(null);
    openOverlay('workoutBuilder');
  }, [setEditingWorkoutId, openOverlay]);

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This will also remove all associated exercises and set targets.`)) return;
    // Cascade delete
    const weIds = await db.workoutExercises
      .where('workoutId')
      .equals(id)
      .toArray()
      .then((arr) => arr.map((w) => w.id!));
    for (const weId of weIds) {
      await db.workoutSetTargets.where('workoutExerciseId').equals(weId).delete();
    }
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  }, []);

  return (
    <div className="pb-24">
      <GradientText as="h2" className="text-3xl mb-6">Workouts</GradientText>

      {!items || items.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No workout templates yet"
          description="Build a workout routine with exercises and set targets."
          actionLabel="Create Workout"
          onAction={handleAdd}
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map(({ workout, gymName, exCount, setCount }) => (
              <WorkoutCard
                key={workout.id!}
                workout={workout}
                gymName={gymName}
                exerciseCount={exCount}
                setCount={setCount}
                onEdit={() => handleEdit(workout.id!)}
                onDelete={() => handleDelete(workout.id!, workout.name)}
              />
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <GlassButton onClick={handleAdd}>+ Create Workout</GlassButton>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkoutList;
