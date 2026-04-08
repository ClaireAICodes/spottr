import { type FC, useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExerciseDefinition, ExerciseMedia as ExerciseMediaType } from '../types';
import { db } from '../db/schema';
import { useAppStore } from '../store/useAppStore';
import GlassCard from '../components/common/GlassCard';
import GlassButton from '../components/common/GlassButton';
import EmptyState from '../components/common/EmptyState';
import GradientText from '../components/common/GradientText';

// ============================================================
// Constants
// ============================================================

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];

// ============================================================
// Hooks
// ============================================================

function useExercises(): ExerciseDefinition[] | undefined {
  return useLiveQuery(
    () => db.exerciseDefinitions.orderBy('name').toArray(),
    []
  );
}

function useMediaForExercise(exerciseId: number | undefined) {
  return useLiveQuery(
    () =>
      exerciseId != null
        ? db.exerciseMedia.where('exerciseId').equals(exerciseId).sortBy('sortOrder')
        : [],
    [exerciseId]
  );
}

// ============================================================
// Muscle Group Picker
// ============================================================

function MuscleGroupPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (gs: string[]) => void;
}) {
  const toggle = (g: string) =>
    onChange(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g]);

  return (
    <GlassCard padded className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-200">Muscle Groups</h3>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => toggle(g)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              selected.includes(g)
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

// ============================================================
// Exercise Card
// ============================================================

function ExerciseCard({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: ExerciseDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const media = useMediaForExercise(exercise.id);
  const firstMedia = media?.[0] as ExerciseMediaType | undefined;

  return (
    <GlassCard padded className="relative group" hover>
      {firstMedia ? (
        <div className="h-20 mb-3 rounded-xl overflow-hidden bg-slate-800">
          <img
            src={URL.createObjectURL(firstMedia.mediaBlob)}
            alt={exercise.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="h-20 mb-3 rounded-xl flex items-center justify-center bg-white/5">
          <span className="text-3xl">🏋️</span>
        </div>
      )}

      <h4 className="text-sm font-semibold text-white truncate">{exercise.name}</h4>
      {exercise.notes && (
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{exercise.notes}</p>
      )}
      {exercise.muscleGroups && exercise.muscleGroups.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {exercise.muscleGroups.map((mg) => (
            <span
              key={mg}
              className="px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-medium"
            >
              {mg}
            </span>
          ))}
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="w-7 h-7 rounded-full bg-white/10 text-xs flex items-center justify-center hover:bg-white/20"
          aria-label={`Edit ${exercise.name}`}
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-7 h-7 rounded-full bg-red-500/20 text-xs flex items-center justify-center hover:bg-red-500/30"
          aria-label={`Delete ${exercise.name}`}
        >
          🗑️
        </button>
      </div>
    </GlassCard>
  );
}

// ============================================================
// Exercise Library — Main Screen
// ============================================================

const ExerciseLibrary: FC = () => {
  const exercises = useExercises();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const setEditingExerciseId = useAppStore((s) => s.setEditingExerciseId);
  const openOverlay = useAppStore((s) => s.openOverlay);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    let result = exercises;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q)
      );
    }
    if (activeGroup) {
      result = result.filter((e) => e.muscleGroups?.includes(activeGroup));
    }
    return result;
  }, [exercises, search, activeGroup]);

  const handleEdit = useCallback(
    (id: number) => {
      setEditingExerciseId(id);
      openOverlay('exerciseEditor');
    },
    [setEditingExerciseId, openOverlay]
  );

  const handleAdd = useCallback(() => {
    setEditingExerciseId(null);
    openOverlay('exerciseEditor');
  }, [setEditingExerciseId, openOverlay]);

  const isEmpty = !exercises || exercises.length === 0;
  const noResults = !isEmpty && filtered.length === 0;

  return (
    <div className="pb-24">
      <GradientText as="h2" className="text-3xl mb-4">Library</GradientText>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍  Search exercises..."
        className="glass-input w-full mb-3"
      />

      {/* Muscle group filter chips */}
      <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
        <button
          onClick={() => setActiveGroup(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            activeGroup === null
              ? 'bg-accent/20 text-accent border border-accent/30'
              : 'bg-white/5 text-slate-400 border border-white/10'
          }`}
        >
          All
        </button>
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(activeGroup === g ? null : g)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeGroup === g
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Content */}
      {isEmpty ? (
        <EmptyState
          icon="📚"
          title="No exercises yet"
          description="Add your first exercise to start building workouts."
          actionLabel="Add Exercise"
          onAction={handleAdd}
        />
      ) : noResults ? (
        <EmptyState icon="🔍" title="No matches" description="Try a different search or filter." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((ex) => (
              <ExerciseCard
                key={ex.id!}
                exercise={ex}
                onEdit={() => handleEdit(ex.id!)}
                onDelete={async () => {
                  if (window.confirm(`Delete "${ex.name}"?`)) {
                    await db.exerciseDefinitions.delete(ex.id!);
                  }
                }}
              />
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <GlassButton onClick={handleAdd}>+ Add Exercise</GlassButton>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// Exercise Editor — Add / Edit Screen
// ============================================================

const ExerciseEditor: FC = () => {
  const editingId = useAppStore((s) => s.editingExerciseId);
  const exercises = useExercises();
  const existing = editingId != null ? exercises?.find((e) => e.id === editingId) : undefined;
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    existing?.muscleGroups ?? []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = String(formData.get('name') ?? '').trim();
      if (!name) return;

      const notes = String(formData.get('notes') ?? '').trim() || undefined;

      if (editingId != null) {
        await db.exerciseDefinitions.update(editingId, { name, notes, muscleGroups: selectedGroups });
      } else {
        await db.exerciseDefinitions.add({
          name,
          notes,
          muscleGroups: selectedGroups,
          createdAt: new Date(),
        });
      }
      closeOverlay('exerciseEditor');
    },
    [editingId, selectedGroups, closeOverlay]
  );

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => closeOverlay('exerciseEditor')}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Back"
        >
          ← Back
        </button>
        <GradientText as="h2" className="text-2xl">
          {editingId != null ? 'Edit Exercise' : 'Add Exercise'}
        </GradientText>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ex-name" className="block text-sm font-medium text-slate-300 mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="ex-name"
            name="name"
            type="text"
            required
            defaultValue={existing?.name ?? ''}
            placeholder="e.g., Barbell Bench Press"
            className="glass-input w-full"
          />
        </div>

        <div>
          <label htmlFor="ex-notes" className="block text-sm font-medium text-slate-300 mb-1.5">
            Notes
          </label>
          <textarea
            id="ex-notes"
            name="notes"
            rows={3}
            defaultValue={existing?.notes ?? ''}
            placeholder="Seat height: 5, grip width: shoulder-width..."
            className="glass-input w-full resize-none"
          />
        </div>

        <MuscleGroupPicker selected={selectedGroups} onChange={setSelectedGroups} />

        {/* Media — Phase 3 minimal: file picker storing raw blobs */}
        {editingId != null && <ExerciseMediaSection exerciseId={editingId} />}

        <div className="flex gap-3 pt-2">
          <button type="submit" className="glass-button flex-1">
            {editingId != null ? 'Save Changes' : 'Add Exercise'}
          </button>
          <GlassButton
            type="button"
            variant="secondary"
            onClick={() => closeOverlay('exerciseEditor')}
          >
            Cancel
          </GlassButton>
        </div>
      </form>
    </div>
  );
};

// ============================================================
// Exercise Media Section (Phase 3 minimal — raw blob storage)
// ============================================================

function ExerciseMediaSection({ exerciseId }: { exerciseId: number }) {
  const media = useMediaForExercise(exerciseId);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const mediaType: 'image' | 'video' = file.type.startsWith('video')
        ? 'video'
        : 'image';
      await db.exerciseMedia.add({
        exerciseId,
        mediaBlob: file,
        mediaType,
        sortOrder: (media?.length ?? 0) + 1,
        createdAt: new Date(),
      });
    }
    e.target.value = ''; // reset so the picker can trigger again for the same file
  };

  const handleDelete = async (id: number) => {
    await db.exerciseMedia.delete(id);
  };

  return (
    <GlassCard padded>
      <h3 className="text-sm font-semibold text-slate-200 mb-3">📷 Media</h3>

      {media && media.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(media as any[]).map((m: any) => (
            <div key={m.id} className="relative group/media">
              {m.mediaType === 'video' ? (
                <video
                  src={URL.createObjectURL(m.mediaBlob)}
                  className="w-full h-20 object-cover rounded-lg"
                  muted
                />
              ) : (
                <img
                  src={URL.createObjectURL(m.mediaBlob)}
                  alt=""
                  className="w-full h-20 object-cover rounded-lg"
                />
              )}
              <button
                onClick={() => handleDelete(m.id)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/80 text-[10px] flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="block cursor-pointer">
        <span className="text-xs text-slate-400 hover:text-accent transition-colors">
          + Add photo or video
        </span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFiles}
          className="hidden"
          aria-label="Add media"
        />
      </label>
    </GlassCard>
  );
}

export { ExerciseEditor };
export default ExerciseLibrary;
