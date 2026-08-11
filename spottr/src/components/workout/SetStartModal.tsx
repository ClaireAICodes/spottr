import { type FC, useState } from 'react';
import { GlassCard, GlassButton, GradientText } from '../common';
import { motion } from 'framer-motion';
import { confetti } from 'canvas-confetti';
import { toast } from 'react-hot-toast';

interface SetStartModalProps {
  targetWeight: number | null;
  targetReps: number | null;
  targetUnit: 'kg' | 'lbs';
  historicMax: number;
  onStart: (useTarget: boolean, weight?: number, reps?: number) => void;
  onCancel: () => void;
  onEdit: (weight: number, reps: number) => void;
}

export const SetStartModal: FC<SetStartModalProps> = ({
  targetWeight,
  targetReps,
  targetUnit,
  historicMax,
  onStart,
  onCancel,
  onEdit,
}) => {
  const [editWeight, setEditWeight] = useState(targetWeight ?? 0);
  const [editReps, setEditReps] = useState(targetReps ?? 0);
  const [showEdit, setShowEdit] = useState(false);
  const isPRTarget = targetWeight != null && targetWeight > historicMax;

  const handleStartWithTarget = () => {
    onStart(true, targetWeight, targetReps);
  };

  const handleEditAndStart = () => {
    onStart(false, editWeight, editReps);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <GlassCard className="w-full max-w-md">
        <div className="space-y-6 p-6">
          {isPRTarget && (
            <div className="flex items-center space-x-2 animate-pulse">
              <span role="img" aria-label="fire">🔥</span>
              <GradientText className="text-sm font-medium">
                PR potential: {targetWeight}{targetUnit} exceeds your max of {historicMax}{targetUnit}
              </GradientText>
            </div>
          )}
          <h2 className="text-lg font-bold text-center">Set {targetReps ?? '--'} reps @ {targetWeight ?? '--'}{targetUnit}</h2>
          {showEdit ? (
            <>
              <div className="space-y-4">
                <label className="block text-sm font-medium">Weight</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editWeight}
                  onChange={(e) => setEditWeight(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <label className="block text-sm font-medium mt-2">Reps</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editReps}
                  onChange={(e) => setEditReps(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <GlassButton onClick={() => setShowEdit(false)} variant="outline">
                  Cancel
                </GlassButton>
                <GlassButton onClick={handleEditAndStart}>
                  Start Set
                </GlassButton>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-center space-x-4">
                <GlassButton onClick={handleStartWithTarget}>
                  Start with Target
                </GlassButton>
                <GlassButton onClick={() => {
                  setShowEdit(true);
                  setEditWeight(targetWeight ?? 0);
                  setEditReps(targetReps ?? 0);
                }} variant="outline">
                  Edit & Start
                </GlassButton>
                <GlassButton onClick={onCancel} variant="outline">
                  Cancel
                </GlassButton>
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
};