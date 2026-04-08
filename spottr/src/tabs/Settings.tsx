import { type FC } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useGyms, deleteGym } from '../db/useDb';
import GlassCard from '../components/common/GlassCard';
import GlassButton from '../components/common/GlassButton';
import EmptyState from '../components/common/EmptyState';
import GradientText from '../components/common/GradientText';

// ============================================================
// Gym Management Sub-Screen
// ============================================================

const GymManagement: FC<{ onDone: () => void }> = ({ onDone }) => {
  const gyms = useGyms();
  const setEditingGymId = useAppStore((s) => s.setEditingGymId);
  const openOverlay = useAppStore((s) => s.openOverlay);

  const handleEdit = (id: number) => {
    setEditingGymId(id);
    openOverlay('gymEditor');
  };

  const handleAdd = () => {
    setEditingGymId(null);
    openOverlay('gymEditor');
  };

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onDone}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Back to Settings"
        >
          ← Back
        </button>
        <GradientText as="h2" className="text-2xl">
          Manage Gyms
        </GradientText>
      </div>

      {(!gyms || gyms.length === 0) ? (
        <EmptyState
          icon="🏋️"
          title="No gyms yet"
          description="Add your first gym to start organizing workouts by location."
          actionLabel="Add Gym"
          onAction={handleAdd}
        />
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {gyms.map((gym) => (
              <GlassCard key={gym.id!} padded hover>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{gym.name}</h3>
                    {gym.address && (
                      <p className="text-sm text-slate-400 mt-1 truncate">{gym.address}</p>
                    )}
                    {gym.latitude != null && gym.longitude != null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${gym.latitude},${gym.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline mt-1 inline-block"
                      >
                        📍 Open in Maps
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(gym.id!)}
                      aria-label={`Edit ${gym.name}`}
                    >
                      ✏️
                    </GlassButton>
                    <GlassButton
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        if (window.confirm(`Delete "${gym.name}"?`)) {
                          await deleteGym(gym.id!);
                        }
                      }}
                      aria-label={`Delete ${gym.name}`}
                    >
                      🗑️
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
          <div className="flex justify-center">
            <GlassButton onClick={handleAdd}>+ Add Gym</GlassButton>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// Gym Editor Sub-Screen
// ============================================================

const GymEditor: FC = () => {
  const editingGymId = useAppStore((s) => s.editingGymId);
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const gyms = useGyms();
  const existingGym = editingGymId ? gyms?.find((g) => g.id === editingGymId) : undefined;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = String(formData.get('name') || '').trim();
    if (!name) return;

    const address = String(formData.get('address') || '').trim() || undefined;
    const latitudeStr = String(formData.get('latitude') || '').trim();
    const longitudeStr = String(formData.get('longitude') || '').trim();
    const latitude = latitudeStr ? parseFloat(latitudeStr) : undefined;
    const longitude = longitudeStr ? parseFloat(longitudeStr) : undefined;

    const { addGym, updateGym } = await import('../db/useDb');

    if (editingGymId !== null) {
      await updateGym(editingGymId, { name, address, latitude, longitude });
    } else {
      await addGym({ name, address, latitude, longitude, createdAt: new Date() });
    }

    closeOverlay('gymEditor');
  };

  const handleGeolocate = (e: React.FormEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const form = e.currentTarget.closest('form')!;
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        (form.elements.namedItem('latitude') as HTMLInputElement).value = pos.coords.latitude.toFixed(6);
        (form.elements.namedItem('longitude') as HTMLInputElement).value = pos.coords.longitude.toFixed(6);
      },
      (err) => {
        alert(`Could not get location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => closeOverlay('gymEditor')}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Back"
        >
          ← Back
        </button>
        <GradientText as="h2" className="text-2xl">
          {editingGymId ? 'Edit Gym' : 'Add Gym'}
        </GradientText>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="gym-name" className="block text-sm font-medium text-slate-300 mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="gym-name"
            name="name"
            type="text"
            required
            defaultValue={existingGym?.name ?? ''}
            placeholder="e.g., Gold's Gym"
            className="glass-input w-full"
          />
        </div>

        <div>
          <label htmlFor="gym-address" className="block text-sm font-medium text-slate-300 mb-1.5">
            Address
          </label>
          <textarea
            id="gym-address"
            name="address"
            rows={2}
            defaultValue={existingGym?.address ?? ''}
            placeholder="123 Main St, Singapore"
            className="glass-input w-full resize-none"
          />
        </div>

        {/* Location Section */}
        <GlassCard padded className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">📍 Location</h3>

          <button
            type="button"
            onClick={handleGeolocate}
            className="glass-button text-sm"
          >
            Use Current Location
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gym-lat" className="block text-xs text-slate-400 mb-1">
                Latitude
              </label>
              <input
                id="gym-lat"
                name="latitude"
                type="number"
                step="any"
                defaultValue={existingGym?.latitude ?? ''}
                placeholder="1.283400"
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label htmlFor="gym-lng" className="block text-xs text-slate-400 mb-1">
                Longitude
              </label>
              <input
                id="gym-lng"
                name="longitude"
                type="number"
                step="any"
                defaultValue={existingGym?.longitude ?? ''}
                placeholder="103.860700"
                className="glass-input w-full text-sm"
              />
            </div>
          </div>
        </GlassCard>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="glass-button flex-1">
            {editingGymId ? 'Save Changes' : 'Add Gym'}
          </button>
          <GlassButton type="button" variant="secondary" onClick={() => closeOverlay('gymEditor')}>
            Cancel
          </GlassButton>
        </div>
      </form>
    </div>
  );
};

// ============================================================
// Settings Tab
// ============================================================

const SettingsTab: FC = () => {
  const defaultWeightUnit = useAppStore((s) => s.defaultWeightUnit);
  const setDefaultWeightUnit = useAppStore((s) => s.setDefaultWeightUnit);
  const progressiveOverloadEnabled = useAppStore((s) => s.progressiveOverloadEnabled);
  const setProgressiveOverloadEnabled = useAppStore((s) => s.setProgressiveOverloadEnabled);
  const prCelebrationEnabled = useAppStore((s) => s.prCelebrationEnabled);
  const setPrCelebrationEnabled = useAppStore((s) => s.setPrCelebrationEnabled);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const overlays = useAppStore((s) => s.overlays);

  if (overlays.gymList) return <GymManagement onDone={() => openOverlay('settings' as any /* just gymList */)} />;

  return (
    <div className="pb-24">
      <GradientText as="h2" className="text-3xl mb-6">Settings</GradientText>

      {/* Units */}
      <GlassCard className="mb-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Default Weight Unit</h3>
        <div className="flex gap-2">
          {(['kg', 'lbs'] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => setDefaultWeightUnit(unit)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                defaultWeightUnit === unit
                  ? 'bg-gradient-main-btn text-white shadow-glow-primary'
                  : 'bg-white/5 text-slate-400 border border-white/10'
              }`}
            >
              {unit.toUpperCase()}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Toggles */}
      <GlassCard className="mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Workout Features</h3>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-white text-sm">Progressive Overload Cues</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Show encouragement when target exceeds your max
            </div>
          </div>
          <button
            onClick={() => {
              setProgressiveOverloadEnabled(!progressiveOverloadEnabled);
            }}
            className={`w-12 h-6 rounded-full transition-colors ${
              progressiveOverloadEnabled ? 'bg-accent' : 'bg-slate-600'
            }`}
            style={progressiveOverloadEnabled ? { backgroundColor: '#38bdf8' } : {}}
            role="switch"
            aria-checked={progressiveOverloadEnabled}
          >
            <div
              className="h-5 w-5 bg-white rounded-full shadow-sm mx-0.5 transition-transform mt-0.5"
              style={{ transform: progressiveOverloadEnabled ? 'translateX(22px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-white text-sm">PR Celebrations</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Confetti & animations when you hit a new PR
            </div>
          </div>
          <button
            onClick={() => {
              const next = !prCelebrationEnabled;
              setPrCelebrationEnabled(next);
            }}
            className={`w-12 h-6 rounded-full transition-colors mt-1`}
            role="switch"
            aria-checked={prCelebrationEnabled}
            style={{ backgroundColor: prCelebrationEnabled ? '#38bdf8' : '#475569' }}
          >
            <div
              className="h-5 w-5 bg-white rounded-full shadow-sm mx-0.5 transition-transform"
              style={{ transform: prCelebrationEnabled ? 'translateX(22px)' : 'translateX(0)' }}
            />
          </button>
        </div>
      </GlassCard>

      {/* Gym Management Link */}
      <GlassCard className="mb-4 hover-lift cursor-pointer" onClick={() => openOverlay('gymList')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-medium">🏋️ Manage Gyms</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Add, edit, or delete gym locations
            </div>
          </div>
          <span className="text-slate-400">→</span>
        </div>
      </GlassCard>

      {/* Danger Zone */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-red-300 mb-2">Danger Zone</h3>
        <button
          onClick={async () => {
            if (window.confirm('⚠️ This will permanently delete ALL your data (workouts, exercises, gyms, history). Continue?')) {
              if (window.confirm('Are you sure? This cannot be undone.')) {
                const { db } = await import('../db/schema.ts');
                await db.delete();
                window.location.reload();
              }
            }
          }}
          className="glass-button w-full"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(239,68,68,0.15))' }}
        >
          🗑️ Reset All Data
        </button>
      </GlassCard>

      {/* Version */}
      <p className="text-center text-xs text-slate-600 mt-8">Spottr v0.1.0 — Phase 3</p>
    </div>
  );
};

export { GymManagement, GymEditor };
export default SettingsTab;
