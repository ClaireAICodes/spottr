import { type FC } from 'react';
import { GlassCard, GlassButton, GradientText } from '../common';
import { motion } from 'framer-motion';
import { confetti } from 'canvas-confetti';
import { toast } from 'react-hot-toast';

interface ExerciseCompleteScreenProps {
  onContinue: () => void;
  // In a full implementation we'd pass stats; for now placeholder.
}

export const ExerciseCompleteScreen: FC<ExerciseCompleteScreenProps> = ({ onContinue }) => {
  // In a real app we'd compute volume, PRs from the session.
  // For demo we'll just show a generic message.
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-[#0f172a] to-[#1e293b]"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          <GradientText className="text-2xl font-bold text-center">
            Exercise Complete
          </GradientText>
          <p className="text-center text-muted-foreground">
            Great job! Keep the momentum.
          </p>
          <GlassButton onClick={onContinue} className="w-full">
            Continue to Next Exercise
          </GlassButton>
        </div>
      </GlassCard>
    </motion.div>
  );
};