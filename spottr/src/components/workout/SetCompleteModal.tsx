import { type FC, useState } from 'react';
import { GlassCard, GlassButton, GradientText } from '../common';
import { motion } from 'framer-motion';
import { confetti } from 'canvas-confetti';
import { toast } from 'react-hot-toast';

interface SetCompleteModalProps {
  weight: number;
  reps: number;
  unit: 'kg' | 'lbs';
  isPR: boolean;
  onConfirm: (acceptNewTarget: boolean) => void;
  onCancel: () => void;
}

export const SetCompleteModal: FC<SetCompleteModalProps> = ({
  weight,
  reps,
  unit,
  isPR,
  onConfirm,
  onCancel,
}) => {
  const [acceptingNewTarget, setAcceptingNewTarget] = useState(false);

  const handleConfirm = () => {
    if (isPR) {
      // Trigger confetti
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      toast.success('🎉 NEW PR!');
    }
    setAcceptingNewTarget(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          {acceptingNewTarget ? (
            <>
              <GradientText className="text-2xl font-bold text-center">
                Save as new target?
              </GradientText>
              <p className="text-center text-muted-foreground">
                Use {weight}{unit} @ {reps} reps for this set next time?
              </p>
              <div className="flex justify-center space-x-4">
                <GlassButton onClick={() => {
                  onConfirm(true);
                }}>
                  Yes, update
                </GlassButton>
                <GlassButton onClick={() => {
                  onConfirm(false);
                  onCancel();
                }} variant="outline">
                  No, keep original
                </GlassButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-center">
                Set Complete
              </h2>
              <p className="text-center">
                {weight}{unit} @ {reps} reps
              </p>
              {isPR && (
                <div className="flex justify-center mt-4">
                  <span role="img" aria-label="party">🎉</span>
                </div>
              )}
              <div className="flex justify-center">
                <GlassButton onClick={handleConfirm}>
                  ✓ Completed
                </GlassButton>
                <GlassButton onClick={() => {
                  setAcceptingNewTarget(true);
                }} variant="outline">
                  ✎ Edit
                </GlassButton>
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
};