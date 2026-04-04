import Dexie, { type Table } from 'dexie';
import type {
  Gym,
  ExerciseDefinition,
  ExerciseMedia,
  Workout,
  WorkoutExercise,
  WorkoutSetTarget,
  WorkoutSession,
  SetLog,
} from '../types';

export class SpottrDatabase extends Dexie {
  gyms!: Table<Gym>;
  exerciseDefinitions!: Table<ExerciseDefinition>;
  exerciseMedia!: Table<ExerciseMedia>;
  workouts!: Table<Workout>;
  workoutExercises!: Table<WorkoutExercise>;
  workoutSetTargets!: Table<WorkoutSetTarget>;
  workoutSessions!: Table<WorkoutSession>;
  setLogs!: Table<SetLog>;

  constructor() {
    super('spottr-db');

    this.version(1).stores({
      gyms: '++id, name',
      exerciseDefinitions: '++id, name',
      exerciseMedia: '++id, exerciseId, mediaType',
      workouts: '++id, gymId, name',
      workoutExercises: '++id, workoutId, exerciseId, orderIndex',
      workoutSetTargets: '++id, [workoutExerciseId+setNumber]',
      workoutSessions: '++id, workoutId, startTime, endTime',
      setLogs: '++id, workoutSessionId, exerciseId, setNumber, isPR',
    });
  }
}

export const db = new SpottrDatabase();
