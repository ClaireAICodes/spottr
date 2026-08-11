import { type FC } from 'react';
import { GlassCard, GradientText } from '../common';
import { ExerciseMedia } from './ExerciseMedia';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

interface ExerciseScreenProps {
  exercise: {
    id: number;
    name: string;
    notes?: string;
    media?: { blob: Blob; mediaType: 'image' | 'video'; alt?: string }[];
  } | null;
  targetWeight: number | null;
  targetReps: number | null;
  setNumber: number;
  onStartSet: (useTarget: boolean, weight?: number, reps?: number) => void;
}

export const ExerciseScreen: FC<ExerciseScreenProps> = ({ exercise, targetWeight, targetReps, setNumber, onStartSet }) => {
  const { unit } = useAppStore((s) => s.unit);
  const media = exercise?.media?.[0];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-[#0f172a] to-[#1e293b]"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          <GradientText className="text-3xl font-bold text-center">{exercise?.name ?? 'Exercise'}</GradientText>
          {media && (
            <ExerciseMedia
              mediaBlob={media.blob}
              mediaType={media.mediaType}
              alt={media.alt ?? exercise?.name ?? ''}
              className="w-full h-48 object-cover rounded-lg mb-4"
            />
          )}
          <div className="text-center text-sm text-muted-foreground">
            Set {setNumber}
          </div>
          <div className="text-2xl font-semibold text-center">
            {targetReps ?? '--'} reps @ {targetWeight ?? '--'} {unit}
          </div>
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => onStartSet(true)}
              className="px-6 py-3 bg-gradient-to-r from-[#38bdf8] to-[#6366f1] text-white rounded-full hover:shadow-lg transition"
            >
              Start with Target
            </button>
            <button
              onClick={() => onStartSet(false)}
              className="px-6 py-3 border border-[#38bdf8]/50 text-[#38bdf8] rounded-full hover:bg-[#38bdf8]/10 transition"
            >
              Edit & Start
            </button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
};