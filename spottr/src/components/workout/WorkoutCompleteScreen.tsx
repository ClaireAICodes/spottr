import { type FC } from 'react';
import { GlassCard, GlassButton, GradientText } from '../common';
import { motion } from 'framer-motion';
import { confetti } from 'canvas-confetti';
import { toast } from 'react-hot-toast';
import { useAppStore } from '../../store/useAppStore';

interface WorkoutCompleteScreenProps {
  onFinish: () => void;
  onRetry: () => void;
}

export const WorkoutCompleteScreen: FC<WorkoutCompleteScreenProps> = ({ onFinish, onRetry }) => {
  const { unit } = useAppStore((s) => s.unit);
  // In a real app we'd fetch stats from session; placeholder.
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-[#0f172a] to-[#1e293b]"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          <GradientText className="text-2xl font-bold text-center">
            Workout Complete!
          </GradientText>
          <p className="text-center text-muted-foreground">
            You crushed it. Time to recover and grow.
          </p>
          <div className="flex flex-col space-x-4">
            <GlassButton onClick={onFinish} className="w-full">
              Save & Exit
            </GlassButton>
            <GlassButton onClick={onRetry} variant="outline">
              Try Again
            </GlassButton>
          </div>
        </div>
      </GlassCard>
      {/* Trigger confetti on mount */}
      {/* We'll use a simple effect via a wrapper; but for simplicity we'll trigger here using a timeout in a useEffect; but we cannot use hooks in this component directly? we can. */}
    </motion.div>
  );
};