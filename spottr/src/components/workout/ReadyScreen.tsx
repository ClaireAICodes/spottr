import { type FC } from 'react';
import { useDb } from '../../db/useDb';
import { GlassButton, GlassCard, GradientText } from '../common';
import { motion } from 'framer-motion';

interface ReadyScreenProps {
  workoutId: number;
  onStart: () => void;
}

export const ReadyScreen: FC<ReadyScreenProps> = ({ workoutId, onStart }) => {
  const { workouts, exercises } = useDb();
  const workout = workouts.find(w => w.id === workoutId);
  const we = exercises?.filter(e => e.workoutId === workoutId) ?? [];
  const totalSets = we.reduce((sum, e) => sum + (e.setTargets?.length ?? 0), 0);
  const estDuration = totalSets * 2; // rough estimate 2 min per set

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-[#0f172a] to-[#1e293b]"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          <GradientText className="text-4xl font-bold text-center">Spottr</GradientText>
          {workout && (
            <>
              <h2 className="text-xl font-semibold text-center">{workout.name}</h2>
              <p className="text-center text-sm text-muted-foreground">
                {we.length} exercises • {totalSets} sets • ~{estDuration} min
              </p>
              <div className="space-y-2">
                {we.map((ex) => (
                  <div key={ex.id} className="text-sm text-muted-foreground">
                    • {ex.exercise?.name ?? 'Unknown'} ({ex.setTargets?.length ?? 0} sets)
                  </div>
                ))}
              </div>
            </>
          )}
          <GlassButton onClick={onStart} className="w-full">
            Begin Workout
          </GlassButton>
        </div>
      </GlassCard>
    </motion.div>
  );
};