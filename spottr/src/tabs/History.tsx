import { type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import GlassCard from '../components/common/GlassCard';
import EmptyState from '../components/common/EmptyState';
import GradientText from '../components/common/GradientText';
import { format, formatDistanceToNow } from 'date-fns';

function useSessionHistory() {
  return useLiveQuery(async () => {
    const sessions = await db.workoutSessions.orderBy('startTime').reverse().toArray();
    if (!sessions.length) return [];

    const results = await Promise.all(
      sessions.map(async (s) => {
        const workout = s.workoutId ? await db.workouts.get(s.workoutId) : undefined;
        const logs = await db.setLogs
          .where('workoutSessionId')
          .equals(s.id!)
          .toArray();
        return {
          session: s,
          workoutName: workout?.name ?? 'Deleted Workout',
          logCount: logs.length,
          totalVolume: logs.reduce((sum, l) => sum + l.actualWeight * l.actualReps, 0),
        };
      })
    );
    return results;
  }, []);
}

// ============================================================
// History Tab
// ============================================================

const HistoryTab: FC = () => {
  const items = useSessionHistory();

  if (!items || items.length === 0) {
    return (
      <div className="pb-24">
        <GradientText as="h2" className="text-3xl mb-6">History</GradientText>
        <EmptyState
          icon="📊"
          title="No sessions recorded"
          description="Complete a workout to see it here."
        />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <GradientText as="h2" className="text-3xl mb-6">History</GradientText>

      <div className="space-y-3">
        {items.map(({ session, workoutName, logCount, totalVolume }) => (
          <GlassCard key={session.id!} padded hover>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-white truncate">{workoutName}</h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  {format(new Date(session.startTime), 'MMM d, yyyy')}
                  {session.startTime && (
                    <>
                      {' • '}
                      {formatDistanceToNow(new Date(session.startTime), { addSuffix: true })}
                    </>
                  )}
                </p>
                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                  <span>{logCount} sets</span>
                  {totalVolume > 0 && <span>{totalVolume.toLocaleString()} kg·reps</span>}
                  {session.endTime && (
                    <span>Ended: {format(new Date(session.endTime), 'HH:mm')}</span>
                  )}
                </div>
              </div>
              {session.endTime ? (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 shrink-0">
                  Complete
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 shrink-0">
                  In Progress
                </span>
              )}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};

export default HistoryTab;
