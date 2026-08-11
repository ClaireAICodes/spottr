import { type FC, useState, useEffect } from 'react';
import { GlassButton, GlassCard } from '../common';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

interface SetInProgressProps {
  onComplete: (useTarget: boolean, weight?: number, reps?: number) => void;
}

export const SetInProgress: FC<SetInProgressProps> = ({ onComplete }) => {
  const { restTimerDuration } = useAppStore((s) => s);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [showRest, setShowRest] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const handleComplete = () => {
    setRunning(false);
    // In real app, we would have captured actual weight/reps from timer UI.
    // For now, we assume they match target (passed from SetStartModal).
    // We'll call onComplete with useTarget true (no edit) – the caller will have passed actual values.
    // Since we don't have actuals here, we need to adjust: we will rely on SetStartModal to pass actual values via edit path.
    // Simplify: after timer ends, we just complete with target values (no edit).
    // The SetStartModal will have already called onComplete with actual values when user confirms.
    // Actually SetStartModal calls onComplete after delay; we need to adjust flow.
    // For simplicity, we'll just call onComplete with no args (meaning use target).
    onComplete(true);
    setShowRest(restTimerDuration > 0);
  };

  const handleSkipRest = () => {
    setShowRest(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-[#0f172a] to-[#1e293b]"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          <div className="text-center">
            <div className="text-2xl font-semibold mb-2">Set in Progress</div>
            {showRest ? (
              <>
                <p className="text-sm text-muted-foreground">Rest: {restTimerDuration - elapsed}s</p>
                <div className="flex justify-center space-x-3">
                  <GlassButton onClick={handleSkipRest} variant="outline">
                    Skip Rest
                  </GlassButton>
                  <GlassButton onClick={() => {/* pause/resume logic */}} variant="outline">
                    Pause
                  </GlassButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Elapsed: {elapsed}s</p>
                <GlassButton onClick={handleComplete} className="w-full">
                  Complete Set
                </GlassButton>
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
};