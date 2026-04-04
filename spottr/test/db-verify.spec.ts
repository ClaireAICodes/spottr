import { test, expect } from 'playwright/test';

/**
 * Phase 2: Database Layer — Dexie.js IndexedDB Verification
 * 
 * These tests run in real Chromium browser, exercising:
 *  - Schema creation (8 tables)
 *  - Full CRUD chain (gym → exercise → workout → set targets)
 *  - Compound index queries
 *  - Session logging with PR detection
 *  - Media blob storage & retrieval
 *  - Module export audit
 *  - Empty-state handling
 *  - End-to-end workout scenario
 */

// ── Shared helper to reset DB ──
async function resetDB(page: any) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/schema.ts');
    await db.delete().catch(() => {});
    await db.open();
  });
}

// ── Shared helper to clean up after test ──
async function cleanup(page: any) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/schema.ts');
    await db.delete();
  });
}

test.describe('Phase 2: Database Layer Verification', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3002/');
    await expect(page).toHaveTitle(/Spottr/);
    // Wait for Dexie DB to initialize (App renders, schema is accessible)
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  // ──────────────────────────────────────────────────────────────
  test('1. Schema: 8 tables exist with correct indexes', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');
      return {
        count: db.tables.length,
        names: db.tables.map((t: any) => t.name),
        // Check that compound index exists on workoutSetTargets
        wksIndexes: db.workoutSetTargets.schema.indexes.map((i: any) => i.name),
      };
    });

    expect(data.count).toBe(8);
    const expected = ['gyms','exerciseDefinitions','exerciseMedia','workouts','workoutExercises','workoutSetTargets','workoutSessions','setLogs'];
    for (const name of expected) {
      expect(data.names).toContain(name);
    }
    // compound index: [workoutExerciseId+setNumber]
    expect(data.wksIndexes).toContain('workoutExerciseId+setNumber');
  });

  // ──────────────────────────────────────────────────────────────
  test('2. CRUD: Create full chain and read back', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');

      const gymId = await db.gyms.add({
        name: 'Home Gym', address: 'Singapore',
        latitude: 1.3, longitude: 103.8, createdAt: new Date()
      });

      const exId = await db.exerciseDefinitions.add({
        name: 'Bench Press', notes: 'flat barbell', createdAt: new Date()
      });

      const wkId = await db.workouts.add({
        gymId: gymId as number, name: 'Push Day', createdAt: new Date()
      });

      const wkExId = await db.workoutExercises.add({
        workoutId: wkId as number, exerciseId: exId as number, orderIndex: 0
      });

      const targetIds = await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: wkExId as number, setNumber: 1, targetReps: 15, targetWeight: 20, targetWeightUnit: 'kg' },
        { workoutExerciseId: wkExId as number, setNumber: 2, targetReps: 10, targetWeight: 60, targetWeightUnit: 'kg' },
        { workoutExerciseId: wkExId as number, setNumber: 3, targetReps: 8, targetWeight: 80, targetWeightUnit: 'kg' },
        { workoutExerciseId: wkExId as number, setNumber: 4, targetReps: 6, targetWeight: 90, targetWeightUnit: 'kg' },
      ]);

      // Read back
      const gym = await db.gyms.get(gymId as number);
      const exercise = await db.exerciseDefinitions.get(exId as number);
      const workout = await db.workouts.get(wkId as number);
      const set3 = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([wkExId as number, 3]).first();
      const allT = await db.workoutSetTargets.where('workoutExerciseId').equals(wkExId as number).sortBy('setNumber');

      return {
        gymId, exId, wkId, targetCount: targetIds.length,
        gymName: gym?.name, gymLat: gym?.latitude,
        exName: exercise?.name, exNotes: exercise?.notes,
        wkGymId: workout?.gymId,
        s3Weight: set3?.targetWeight, s3Reps: set3?.targetReps,
        tCount: allT.length, sets: allT.map((t: any) => t.setNumber)
      };
    });

    expect(data.gymId).toBeGreaterThan(0);
    expect(data.targetCount).toBe(4);
    expect(data.gymName).toBe('Home Gym');
    expect(data.gymLat).toBe(1.3);
    expect(data.exName).toBe('Bench Press');
    expect(data.exNotes).toBe('flat barbell');
    expect(data.wkGymId).toBe(data.gymId);
    expect(data.s3Weight).toBe(80);
    expect(data.s3Reps).toBe(8);
    expect(data.tCount).toBe(4);
    expect(data.sets).toEqual([1, 2, 3, 4]);
  });

  // ──────────────────────────────────────────────────────────────
  test('3. Compound index: [workoutExerciseId+setNumber]', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');
      const weId = await db.workoutExercises.add({
        workoutId: 1, exerciseId: 1, orderIndex: 0
      });
      await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: weId as number, setNumber: 1, targetReps: 12, targetWeight: 50, targetWeightUnit: 'kg' },
        { workoutExerciseId: weId as number, setNumber: 2, targetReps: 10, targetWeight: 70, targetWeightUnit: 'kg' },
        { workoutExerciseId: weId as number, setNumber: 3, targetReps: 8, targetWeight: 90, targetWeightUnit: 'kg' },
      ]);

      const s2 = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([weId as number, 2]).first();
      const none = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([weId as number, 99]).first();
      const all = await db.workoutSetTargets.where('workoutExerciseId').equals(weId as number).sortBy('setNumber');

      return { w2: s2?.targetWeight, r2: s2?.targetReps, none, cnt: all.length };
    });

    expect(data.w2).toBe(70);
    expect(data.r2).toBe(10);
    expect(data.none).toBeUndefined();
    expect(data.cnt).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────
  test('4. Sessions & Set Logs with PR flag', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');
      const exId = await db.exerciseDefinitions.add({ name: 'Squats', createdAt: new Date() });
      const sid = await db.workoutSessions.add({ workoutId: 1, startTime: new Date() });

      await db.setLogs.add({
        workoutSessionId: sid as number, exerciseId: exId as number,
        setNumber: 1, actualWeight: 80, actualReps: 10, restTimeTaken: 60, isPR: false, createdAt: new Date()
      });
      await db.setLogs.add({
        workoutSessionId: sid as number, exerciseId: exId as number,
        setNumber: 2, actualWeight: 100, actualReps: 8, restTimeTaken: 90, isPR: true, createdAt: new Date()
      });

      const bySession = await db.setLogs.where('workoutSessionId').equals(sid as number).toArray();
      const byExercise = await db.setLogs.where('exerciseId').equals(exId as number).toArray();
      const allLogs = await db.setLogs.toArray();
      const prs = allLogs.filter((l: any) => l.isPR === true);

      return {
        sessionCount: bySession.length,
        exerciseCount: byExercise.length,
        total: allLogs.length,
        prCount: prs.length,
        prWeight: prs.length > 0 ? prs[0].actualWeight : null,
      };
    });

    expect(data.sessionCount).toBe(2);
    expect(data.exerciseCount).toBe(2);
    expect(data.total).toBe(2);
    expect(data.prCount).toBe(1);
    expect(data.prWeight).toBe(100);
  });

  // ──────────────────────────────────────────────────────────────
  test('5. Media Blob: store → retrieve', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');

      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#fff';
      ctx.font = '32px sans-serif';
      ctx.fillText('PR!', 30, 70);

      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));

      const mediaId = await db.exerciseMedia.add({
        exerciseId: 1, mediaBlob: blob, mediaType: 'image', sortOrder: 1, createdAt: new Date()
      });

      const fetched = await db.exerciseMedia.get(mediaId as number);
      const rb = fetched?.mediaBlob;
      return { id: mediaId, stored: blob.size, retrieved: rb instanceof Blob, size: rb?.size, type: rb?.type };
    });

    expect(data.id).toBeGreaterThan(0);
    expect(data.retrieved).toBe(true);
    expect(data.size).toBe(data.stored);
    expect(data.type).toBe('image/png');
  });

  // ──────────────────────────────────────────────────────────────
  test('6. useDb module: exports audit', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const mod = await import('/src/db/useDb.ts');
      const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');

      const hooks = fns.filter(([k]) => k.startsWith('use')).map(([k]) => k);
      const muts = fns.filter(([k]) => (k.startsWith('add') || k.startsWith('update') || k.startsWith('delete') || k.startsWith('start') || k.startsWith('end') || k.startsWith('log') || k.startsWith('reorder') || k.startsWith('get'))).map(([k]) => k);

      return { total: fns.length, hooks: hooks.sort(), mutations: muts.sort() };
    });

    expect(data.total).toBeGreaterThan(20);

    // Critical hooks
    for (const h of ['useGyms','useExercises','useWorkouts','useSessions','useRecentPRs','useWorkoutsByGym','useWorkout','useExercise','useExerciseMedia','useSession']) {
      expect(data.hooks).toContain(h);
    }

    // Critical mutations
    for (const m of ['addGym','deleteGym','addExercise','addWorkout','deleteWorkout','startSession','endSession','logSet','logSetWithPRDetection','getWorkoutDetail','getSessionDetail','getWorkoutsThisMonth','getTotalPRCount','getCurrentStreakWeeks']) {
      expect(data.mutations).toContain(m);
    }
  });

  // ──────────────────────────────────────────────────────────────
  test('7. Empty state: no crashes, clean results', async ({ page }) => {
    await resetDB(page);
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');
      try {
        return {
          gymsEmpty: (await db.gyms.toArray()).length === 0,
          workoutsEmpty: (await db.workouts.toArray()).length === 0,
          logsEmpty: (await db.setLogs.toArray()).length === 0,
          compound: await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([999, 1]).first(),
          single: await db.gyms.get(999),
          error: null,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    expect(data.error).toBeNull();
    expect(data.gymsEmpty).toBe(true);
    expect(data.workoutsEmpty).toBe(true);
    expect(data.logsEmpty).toBe(true);
    expect(data.compound).toBeUndefined();
    expect(data.single).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────
  test('8. End-to-end: full 3-exercise session with PRs', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');

      // Create
      const gymId = await db.gyms.add({ name: "Gold's Gym", address: 'Marina Bay', latitude: 1.28, longitude: 103.86, createdAt: new Date() });
      const bpId = await db.exerciseDefinitions.add({ name: 'Barbell Bench Press', createdAt: new Date() });
      const sqId = await db.exerciseDefinitions.add({ name: 'Barbell Back Squat', createdAt: new Date() });
      const ohpId = await db.exerciseDefinitions.add({ name: 'Overhead Press', createdAt: new Date() });

      // Workout with 3 exercises, different set counts
      const wkId = await db.workouts.add({ gymId: gymId as number, name: 'Push Day', createdAt: new Date() });

      // Bench — 4 sets
      const benchWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: bpId as number, orderIndex: 0 });
      await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: benchWe as number, setNumber: 1, targetReps: 15, targetWeight: 40, targetWeightUnit: 'kg' },
        { workoutExerciseId: benchWe as number, setNumber: 2, targetReps: 12, targetWeight: 60, targetWeightUnit: 'kg' },
        { workoutExerciseId: benchWe as number, setNumber: 3, targetReps: 8, targetWeight: 80, targetWeightUnit: 'kg' },
        { workoutExerciseId: benchWe as number, setNumber: 4, targetReps: 6, targetWeight: 90, targetWeightUnit: 'kg' },
      ]);

      // Squats — 3 sets
      const sqWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: sqId as number, orderIndex: 1 });
      await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: sqWe as number, setNumber: 1, targetReps: 12, targetWeight: 60, targetWeightUnit: 'kg' },
        { workoutExerciseId: sqWe as number, setNumber: 2, targetReps: 10, targetWeight: 80, targetWeightUnit: 'kg' },
        { workoutExerciseId: sqWe as number, setNumber: 3, targetReps: 8, targetWeight: 100, targetWeightUnit: 'kg' },
      ]);

      // OHP — 2 sets
      const ohpWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: ohpId as number, orderIndex: 2 });
      await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: ohpWe as number, setNumber: 1, targetReps: 10, targetWeight: 30, targetWeightUnit: 'kg' },
        { workoutExerciseId: ohpWe as number, setNumber: 2, targetReps: 8, targetWeight: 40, targetWeightUnit: 'kg' },
      ]);

      // Execute session
      const sid = await db.workoutSessions.add({ workoutId: wkId as number, startTime: new Date() });

      // Bench
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 1, actualWeight: 40, actualReps: 15, restTimeTaken: 45, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 2, actualWeight: 60, actualReps: 12, restTimeTaken: 60, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 3, actualWeight: 80, actualReps: 8, restTimeTaken: 90, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 4, actualWeight: 95, actualReps: 6, restTimeTaken: 120, isPR: true, createdAt: new Date() });
      // Squats
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 1, actualWeight: 60, actualReps: 12, restTimeTaken: 60, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 2, actualWeight: 80, actualReps: 10, restTimeTaken: 90, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 3, actualWeight: 105, actualReps: 8, restTimeTaken: 120, isPR: true, createdAt: new Date() });
      // OHP
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: ohpId as number, setNumber: 1, actualWeight: 30, actualReps: 10, restTimeTaken: 60, isPR: false, createdAt: new Date() });
      await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: ohpId as number, setNumber: 2, actualWeight: 42, actualReps: 8, restTimeTaken: 120, isPR: true, createdAt: new Date() });

      // Query results
      const sessionLogs = await db.setLogs.where('workoutSessionId').equals(sid as number).toArray();
      const allLogs = await db.setLogs.toArray();
      const prs = allLogs.filter((l: any) => l.isPR === true);
      const volume = sessionLogs.reduce((sum: number, l: any) => sum + l.actualWeight * l.actualReps, 0);
      const session = await db.workoutSessions.get(sid as number);

      return {
        totalSets: sessionLogs.length,
        prCount: prs.length,
        prWeights: prs.map((l: any) => l.actualWeight).sort((a: any, b: any) => a - b),
        totalVolume: volume,
        sessionExists: session !== undefined,
        benchSets: sessionLogs.filter((l: any) => l.exerciseId === bpId).length,
        squatSets: sessionLogs.filter((l: any) => l.exerciseId === sqId).length,
        ohpSets: sessionLogs.filter((l: any) => l.exerciseId === ohpId).length,
      };
    });

    expect(data.totalSets).toBe(9);  // 4+3+2
    expect(data.prCount).toBe(3);
    expect(data.prWeights).toEqual([42, 95, 105]);
    expect(data.totalVolume).toBeGreaterThan(3000);
    expect(data.sessionExists).toBe(true);
    expect(data.benchSets).toBe(4);
    expect(data.squatSets).toBe(3);
    expect(data.ohpSets).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────
  test('9. Delete operations and orphan cleanup', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const { db } = await import('/src/db/schema.ts');

      const wkId = await db.workouts.add({ gymId: 1, name: 'Delete Me', createdAt: new Date() });
      const we = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: 1, orderIndex: 0 });
      await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: we as number, setNumber: 1, targetReps: 10, targetWeight: 50, targetWeightUnit: 'kg' },
        { workoutExerciseId: we as number, setNumber: 2, targetReps: 8, targetWeight: 70, targetWeightUnit: 'kg' },
      ]);

      const before = {
        workouts: await db.workouts.count(),
        we: await db.workoutExercises.where('workoutId').equals(wkId as number).count(),
        targets: await db.workoutSetTargets.count(),
      };

      // The useDb module's deleteWorkout function handles cascading
      // For raw test, we test the raw delete behavior
      await db.workoutSetTargets.where('workoutExerciseId').equals(we as number).delete();
      await db.workoutExercises.where('workoutId').equals(wkId as number).delete();
      await db.workouts.delete(wkId as number);

      const after = {
        workouts: await db.workouts.count(),
        we: await db.workoutExercises.where('workoutId').equals(wkId as number).count(),
        targets: await db.workoutSetTargets.where('workoutExerciseId').equals(we as number).count(),
      };

      return { before, after };
    });

    expect(data.before.workouts).toBeGreaterThanOrEqual(1);
    expect(data.after.workouts).toBe(data.before.workouts - 1);
    expect(data.after.we).toBe(0);
    expect(data.after.targets).toBe(0);
  });

});
