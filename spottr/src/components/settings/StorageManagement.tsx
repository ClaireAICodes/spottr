import { type FC, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import GlassCard from '../common/GlassCard';
import GlassButton from '../common/GlassButton';
import { getStorageUsage, formatBytes, getStoragePercentage, getStorageStatus, findOrphanedMedia, cleanupOrphanedMedia } from '../../utils/storageManager';

const StorageManagement: FC = () => {
  const [usage, setUsage] = useState<{ used: number; quota: number }>({ used: 0, quota: 0 });
  const [orphanCount, setOrphanCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Media count for additional context (optional)
  const mediaCount = useLiveQuery(() => db.exerciseMedia.count(), []);

  const refresh = async () => {
    const data = await getStorageUsage();
    setUsage(data);
    const orphans = await findOrphanedMedia();
    setOrphanCount(orphans.length);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const percent = getStoragePercentage(usage.used, usage.quota);
  const status = getStorageStatus(percent);

  const handleCleanup = async () => {
    setLoading(true);
    try {
      const count = await cleanupOrphanedMedia();
      if (count > 0) {
        setMessage({ type: 'success', text: `Cleaned up ${count} orphaned media file(s).` });
      } else {
        setMessage({ type: 'success', text: 'No orphaned media found.' });
      }
      await refresh();
    } catch (err) {
      setMessage({ type: 'error', text: `Cleanup failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Storage Usage</h3>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                status === 'critical'
                  ? 'bg-red-500'
                  : status === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-between text-xs text-slate-400 mb-2">
          <span>{formatBytes(usage.used)} used</span>
          <span>{usage.quota > 0 ? formatBytes(usage.quota) : 'Quota unknown'}</span>
        </div>

        {status === 'warning' && (
          <p className="text-xs text-amber-400 mb-2">
            ⚠️ Storage is {percent}% full. Consider exporting or deleting media.
          </p>
        )}
        {status === 'critical' && (
          <p className="text-xs text-red-400 mb-2">
            🛑 Storage critically full ({percent}%). Uploads may fail soon.
          </p>
        )}

        {/* Media info */}
        <div className="mt-2 text-xs text-slate-500">
          {mediaCount !== undefined && `${mediaCount} media file(s) stored`}
        </div>

        {/* Orphan cleanup */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-300">Orphaned Media</span>
            <span className="text-xs text-slate-400">{orphanCount} file(s)</span>
          </div>
          <GlassButton
            variant="secondary"
            size="sm"
            onClick={handleCleanup}
            disabled={loading || orphanCount === 0}
            className="w-full"
          >
            {loading ? 'Cleaning...' : 'Clean Up Orphaned Media'}
          </GlassButton>
        </div>
      </GlassCard>

      {message && (
        <GlassCard padded className={message.type === 'error' ? 'border-red-500/30' : ''}>
          <p className={`text-xs ${message.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {message.text}
          </p>
        </GlassCard>
      )}
    </div>
  );
};

export default StorageManagement;
