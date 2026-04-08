import { type FC, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { useAppStore } from '../../store/useAppStore';
import GlassCard from '../common/GlassCard';
import GlassButton from '../common/GlassButton';
import GradientText from '../common/GradientText';

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
  const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];
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
// Media Section (uses raw upload; Phase 4 will enhance)
// ============================================================

import { compressImage, compressVideo } from '../../utils/mediaCompress';

// ... rest of imports ...

function ExerciseMediaSection({ exerciseId }: { exerciseId: number }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    setUploadProgress(0);

    for (const file of Array.from(files)) {
      try {
        const isVideo = file.type.startsWith('video');
        let blob: Blob;

        // Phase 4: Apply compression
        if (isVideo) {
          blob = await compressVideo(file, 720, 2_000_000, 50); // 720p, 2Mbps, 50MB limit
        } else {
          blob = await compressImage(file, 1920, 0.8, 5); // 1920px width, 80% quality, 5MB limit
        }

        await db.exerciseMedia.add({
          exerciseId,
          mediaBlob: blob,
          mediaType: isVideo ? 'video' : 'image',
          sortOrder: Date.now(),
          createdAt: new Date(),
        });
        setUploadProgress((p) => Math.min(p + 50, 100));
      } catch (err) {
        console.error('Media upload failed:', err);
        // Provide user-friendly error messages
        if (err instanceof Error && err.message.includes('exceeds') && err.message.includes('MB limit')) {
          alert(`File too large after compression. Try a smaller file or lower resolution.`);
        } else {
          alert(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    setUploading(false);
    setUploadProgress(0);
    e.target.value = '';
  };

  // Fetch media for this exercise
  const media = useLiveQuery(
    () => db.exerciseMedia.where('exerciseId').equals(exerciseId).sortBy('sortOrder'),
    [exerciseId]
  );

  const handleDelete = async (id: number) => {
    await db.exerciseMedia.delete(id);
  };

  return (
    <GlassCard padded>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">📷 Media</h3>
        {uploading && <span className="text-xs text-accent">Uploading... {uploadProgress}%</span>}
      </div>

      {media && media.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {media.map((m: any) => (
            <div key={m.id} className="relative group/media">
              {m.mediaType === 'video' ? (
                <video
                  src={URL.createObjectURL(m.mediaBlob)}
                  className="w-full h-20 object-cover rounded-lg"
                  muted
                  playsInline
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
                aria-label="Delete media"
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
          disabled={uploading}
        />
      </label>
      {uploading && (
        <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}
    </GlassCard>
  );
}

// ============================================================
// Exercise Editor
// ============================================================

const ExerciseEditor: FC = () => {
  const editingId = useAppStore((s) => s.editingExerciseId);
  const exercises = useExercises();
  const existing = editingId != null ? exercises?.find((e) => e.id === editingId) : undefined;
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    existing?.muscleGroups ?? []
  );

  // Fetch exercises hook
  function useExercises() {
    return useLiveQuery(
      () => db.exerciseDefinitions.orderBy('name').toArray(),
      []
    );
  }

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

export { ExerciseEditor };
export default ExerciseEditor;
