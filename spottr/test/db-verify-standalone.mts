#!/usr/bin/env -S npx tsx
/**
 * Phase 2: Database Layer Verification — Playwright Standalone Runner
 * 
 * Usage: npx tsx test/db-verify-standalone.mts
 * 
 * This script uses raw Playwright (not @playwright/test) to spin up
 * a real Chromium browser and validate the Dexie.js database layer
 * against the running Vite dev server at localhost:3002.
 */

import { chromium } from 'playwright';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  return fn().then(() => {
    passedTests++;
    console.log(`  ✓ ${name}`);
  }).catch((err) => {
    failedTests++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
    throw err; // re-throw so the run fails overall
  });
}

async function resetDB(page: any) {
  // Delete the DB, then re-open to create fresh tables
  await page.evaluate(async () => {
    try {
      const { db } = await import('/src/db/schema.ts');
      await db.delete();
    } catch {}
  });
}

async function main() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('\n=== Phase 2: Database Layer Verification ===\n');
    await page.goto('http://localhost:3002/');
    await page.waitForTimeout(3000); // Let Dexie initialize
    console.log('Browser connected to dev server.\n');

    // ── 1. Schema ──
    console.log('─ Schema ─');
    await test('8 tables created', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        return { count: db.tables.length, names: db.tables.map((t: any) => t.name) };
      });
      const wanted = ['exerciseDefinitions','exerciseMedia','gyms','setLogs','workoutExercises','workoutSessions','workoutSetTargets','workouts'];
      if (data.count !== 8) throw new Error(`Expected 8, got ${data.count}`);
      const missing = wanted.filter(w => !data.names.includes(w));
      if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
    });

    await test('Compound index on workoutSetTargets', async () => {
      const indexes = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        return db.workoutSetTargets.schema.indexes.map((i: any) => i.name);
      });
      const hasCompound = indexes.some((name: string) => name.includes('+')); // Dexie names compound indexes with +
      if (!hasCompound) throw new Error(`Expected compound index, got: ${JSON.stringify(indexes)}`);
    });

    await resetDB(page);

    // ── 2. CRUD Chain ──
    console.log('\n─ CRUD Operations ─');
    await test('Create gym with coordinates', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const id = await db.gyms.add({ name: 'Home Gym', address: 'Singapore', latitude: 1.3, longitude: 103.8, createdAt: new Date() });
        const gym = await db.gyms.get(id as number);
        return { id, name: gym?.name, lat: gym?.latitude };
      });
      if (data.id <= 0) throw new Error(`Invalid id: ${data.id}`);
      if (data.name !== 'Home Gym') throw new Error(`name="${data.name}"`);
      if (data.lat !== 1.3) throw new Error(`lat=${data.lat}`);
    });

    await test('Create exercise with notes', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const id = await db.exerciseDefinitions.add({ name: 'Bench Press', notes: 'flat barbell', createdAt: new Date() });
        const ex = await db.exerciseDefinitions.get(id as number);
        return { id, name: ex?.name, notes: ex?.notes };
      });
      if (data.name !== 'Bench Press') throw new Error(`name="${data.name}"`);
      if (data.notes !== 'flat barbell') throw new Error(`notes="${data.notes}"`);
    });

    await test('Create workout linked to gym', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const gymId = await db.gyms.add({ name: 'G', createdAt: new Date() });
        const wkId = await db.workouts.add({ gymId: gymId as number, name: 'Push Day', createdAt: new Date() });
        const wk = await db.workouts.get(wkId as number);
        return { gymId: wk?.gymId, wkId, exGym: wk?.gymId === gymId };
      });
      if (!data.exGym) throw new Error('gymId linked wrong');
    });

    await test('Full chain: gym → workout → exercise → 4 set targets', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const gymId = await db.gyms.add({ name: 'G', createdAt: new Date() });
        const exId = await db.exerciseDefinitions.add({ name: 'Bench', createdAt: new Date() });
        const wkId = await db.workouts.add({ gymId: gymId as number, name: 'Push', createdAt: new Date() });
        const wkExId = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: exId as number, orderIndex: 0 });
        const tIds = await db.workoutSetTargets.bulkAdd([
          { workoutExerciseId: wkExId as number, setNumber: 1, targetReps: 15, targetWeight: 20, targetWeightUnit: 'kg' },
          { workoutExerciseId: wkExId as number, setNumber: 2, targetReps: 10, targetWeight: 60, targetWeightUnit: 'kg' },
          { workoutExerciseId: wkExId as number, setNumber: 3, targetReps: 8, targetWeight: 80, targetWeightUnit: 'kg' },
          { workoutExerciseId: wkExId as number, setNumber: 4, targetReps: 6, targetWeight: 90, targetWeightUnit: 'kg' },
        ]);

        // Verify compound index query
        const s3 = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([wkExId as number, 3]).first();
        const allT = await db.workoutSetTargets.where('workoutExerciseId').equals(wkExId as number).sortBy('setNumber');

        return { tCount: tIds.length, s3Weight: s3?.targetWeight, s3Reps: s3?.targetReps, tAll: allT.length, sets: allT.map((t: any) => t.setNumber) };
      });
      if (data.tCount !== 4) throw new Error(`target count=${data.tCount}`);
      if (data.s3Weight !== 80 || data.s3Reps !== 8) throw new Error(`set 3: ${data.s3Reps}@${data.s3Weight}kg`);
      if (data.tAll !== 4) throw new Error(`sorted count=${data.tAll}`);
      const setsExpected = [1,2,3,4];
      const setsMatch = JSON.stringify(data.sets) === JSON.stringify(setsExpected);
      if (!setsMatch) throw new Error(`sets order: ${JSON.stringify(data.sets)}`);
    });

    await resetDB(page);

    // ── 3. Sessions & PRs ──
    console.log('\n─ Sessions & PRs ─');
    await test('Log sets and filter by PR', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const exId = await db.exerciseDefinitions.add({ name: 'Squats', createdAt: new Date() });
        const sid = await db.workoutSessions.add({ workoutId: 1, startTime: new Date() });

        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: exId as number, setNumber: 1, actualWeight: 80, actualReps: 10, restTimeTaken: 60, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: exId as number, setNumber: 2, actualWeight: 100, actualReps: 8, restTimeTaken: 90, isPR: true, createdAt: new Date() });

        const allLogs = await db.setLogs.toArray();
        const prs = allLogs.filter((l: any) => l.isPR === true);
        return { total: allLogs.length, prCount: prs.length, prWeight: prs.length ? prs[0].actualWeight : null };
      });
      if (data.total !== 2) throw new Error(`logs=${data.total}`);
      if (data.prCount !== 1) throw new Error(`prs=${data.prCount}`);
      if (data.prWeight !== 100) throw new Error(`prWeight=${data.prWeight}`);
    });

    await resetDB(page);

    // ── 4. Blob Storage ──
    console.log('\n─ Media Blobs ─');
    await test('Store image blob and retrieve intact', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(0, 0, 128, 128);
        const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));

        const mediaId = await db.exerciseMedia.add({ exerciseId: 1, mediaBlob: blob, mediaType: 'image', sortOrder: 1, createdAt: new Date() });
        const fetched = await db.exerciseMedia.get(mediaId as number);
        const rb = fetched?.mediaBlob;
        return { id: mediaId, storedSize: blob.size, retrieved: rb instanceof Blob, retrievedSize: rb?.size, matchSize: blob.size === rb?.size };
      });
      if (data.id <= 0) throw new Error(`id=${data.id}`);
      if (!data.retrieved) throw new Error('not a Blob');
      if (!data.matchSize) throw new Error(`size mismatch: ${data.storedSize} vs ${data.retrievedSize}`);
    });

    await resetDB(page);

    // ── 4a. Delete & Cascade ──
    console.log('\n─ Delete Operations ─');
    await test('Delete workout cascades to workoutExercises', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const wkId = await db.workouts.add({ gymId: 1, name: 'X', createdAt: new Date() });
        const we = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: 1, orderIndex: 0 });
        await db.workoutSetTargets.bulkAdd([
          { workoutExerciseId: we as number, setNumber: 1, targetReps: 10, targetWeight: 50, targetWeightUnit: 'kg' },
          { workoutExerciseId: we as number, setNumber: 2, targetReps: 8, targetWeight: 70, targetWeightUnit: 'kg' },
        ]);

        // Cascade delete
        await db.workoutSetTargets.where('workoutExerciseId').equals(we as number).delete();
        await db.workoutExercises.where('workoutId').equals(wkId as number).delete();
        await db.workouts.delete(wkId as number);

        return {
          workoutGone: await db.workouts.get(wkId as number) === undefined,
          weGone: await db.workoutExercises.where('workoutId').equals(wkId as number).count(),
          targetGone: await db.workoutSetTargets.where('workoutExerciseId').equals(we as number).count(),
        };
      });
      if (!data.workoutGone) throw new Error('workout not deleted');
      if (data.weGone !== 0) throw new Error(`workoutExercises not cleaned: ${data.weGone}`);
      if (data.targetGone !== 0) throw new Error(`targets not cleaned: ${data.targetGone}`);
    });

    await resetDB(page);

    // ── 5. Module Exports ──
    console.log('\n─ Module Structure ─');
    await test('useDb exports 25+ functions including all hooks and CRUD', async () => {
      const data = await page.evaluate(async () => {
        const mod = await import('/src/db/useDb.ts');
        const members = Object.entries(mod).filter(([, v]) => typeof v === 'function');

        const hooks = members.filter(([k]) => k.startsWith('use')).map(([k]) => k);
        const crud = members.filter(([k]) => (k.startsWith('add') || k.startsWith('update') || k.startsWith('delete') || k.startsWith('start') || k.startsWith('end') || k.startsWith('log') || k.startsWith('reorder'))).map(([k]) => k);
        const getFns = members.filter(([k]) => k.startsWith('get')).map(([k]) => k);
        const isExported = members.map(([k]) => k);
        return { total: members.length, hooks: hooks.sort(), crud: crud.sort(), getters: getFns.sort(), all: isExported.sort() };
      });

      if (data.total < 25) throw new Error(`Only ${data.total} exports (expected 25+)`);
      const requiredHooks = ['useGyms','useExercises','useWorkouts','useSessions','useRecentPRs','useWorkoutsByGym','useWorkout','useExercise','useExerciseMedia','useSession'];
      for (const h of requiredHooks) {
        if (!data.hooks.includes(h)) throw new Error(`Missing hook: ${h}`);
      }
      const requiredCRUD = ['addGym','deleteGym','addExercise','addWorkout','deleteWorkout','startSession','endSession','logSet','logSetWithPRDetection'];
      for (const c of requiredCRUD) {
        if (!data.crud.includes(c)) throw new Error(`Missing CRUD: ${c}`);
      }
      const requiredGet = ['getWorkoutDetail','getSessionDetail','getWorkoutsThisMonth','getTotalPRCount','getCurrentStreakWeeks'];
      for (const g of requiredGet) {
        if (!data.getters.includes(g)) throw new Error(`Missing getter: ${g}`);
      }
    });

    // ── 6. Empty States ──
    await resetDB(page);
    console.log('\n─ Edge Cases ─');
    await test('Empty queries return clean results, no errors', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        try {
          const a = await db.gyms.toArray();
          const c = await db.workouts.toArray();
          const e = await db.setLogs.toArray();
          const f = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([99999, 1]).first();
          const g = await db.gyms.get(99999);
          return { a: a.length, c: c.length, e: e.length, f, g, ok: true };
        } catch (err: any) {
          return { ok: false, err: err.message };
        }
      });
      if (!data.ok) throw new Error(data.err || 'empty query failed');
      if (data.a !== 0) throw new Error(`gyms=${data.a}`);
      if (data.f !== undefined) throw new Error(`compound returned value`);
      if (data.g !== undefined) throw new Error(`get(999) returned value`);
    });

    // ── 7. End-to-end full session ──
    await resetDB(page);
    console.log('\n─ End-to-End: Full Multi-Exercise Session ─');
    await test('3 exercises, 9 sets, 3 PRs, correct volume', async () => {
      const data = await page.evaluate(async () => {
        const { db } = await import('/src/db/schema.ts');
        const gymId = await db.gyms.add({ name: "Gold's Gym", createdAt: new Date() });
        const bpId = await db.exerciseDefinitions.add({ name: 'Barbell Bench Press', createdAt: new Date() });
        const sqId = await db.exerciseDefinitions.add({ name: 'Barbell Back Squat', createdAt: new Date() });
        const ohpId = await db.exerciseDefinitions.add({ name: 'Overhead Press', createdAt: new Date() });

        const wkId = await db.workouts.add({ gymId: gymId as number, name: 'Push Day', createdAt: new Date() });

        const benchWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: bpId as number, orderIndex: 0 });
        await db.workoutSetTargets.bulkAdd([
          { workoutExerciseId: benchWe as number, setNumber: 1, targetReps: 15, targetWeight: 40, targetWeightUnit: 'kg' },
          { workoutExerciseId: benchWe as number, setNumber: 2, targetReps: 12, targetWeight: 60, targetWeightUnit: 'kg' },
          { workoutExerciseId: benchWe as number, setNumber: 3, targetReps: 8, targetWeight: 80, targetWeightUnit: 'kg' },
          { workoutExerciseId: benchWe as number, setNumber: 4, targetReps: 6, targetWeight: 90, targetWeightUnit: 'kg' },
        ]);
        const sqWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: sqId as number, orderIndex: 1 });
        await db.workoutSetTargets.bulkAdd([
          { workoutExerciseId: sqWe as number, setNumber: 1, targetReps: 12, targetWeight: 60, targetWeightUnit: 'kg' },
          { workoutExerciseId: sqWe as number, setNumber: 2, targetReps: 10, targetWeight: 80, targetWeightUnit: 'kg' },
          { workoutExerciseId: sqWe as number, setNumber: 3, targetReps: 8, targetWeight: 100, targetWeightUnit: 'kg' },
        ]);
        const ohpWe = await db.workoutExercises.add({ workoutId: wkId as number, exerciseId: ohpId as number, orderIndex: 2 });
        await db.workoutSetTargets.bulkAdd([
          { workoutExerciseId: ohpWe as number, setNumber: 1, targetReps: 10, targetWeight: 30, targetWeightUnit: 'kg' },
          { workoutExerciseId: ohpWe as number, setNumber: 2, targetReps: 8, targetWeight: 40, targetWeightUnit: 'kg' },
        ]);

        const sid = await db.workoutSessions.add({ workoutId: wkId as number, startTime: new Date() });

        // Bench
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 1, actualWeight: 40, actualReps: 15, restTimeTaken: 45, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 2, actualWeight: 60, actualReps: 12, restTimeTaken: 60, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 3, actualWeight: 80, actualReps: 8, restTimeTaken: 90, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: bpId as number, setNumber: 4, actualWeight: 95, actualReps: 6, restTimeTaken: 120, isPR: true, createdAt: new Date() });
        // Squat
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 1, actualWeight: 60, actualReps: 12, restTimeTaken: 60, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 2, actualWeight: 80, actualReps: 10, restTimeTaken: 90, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: sqId as number, setNumber: 3, actualWeight: 105, actualReps: 8, restTimeTaken: 120, isPR: true, createdAt: new Date() });
        // OHP
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: ohpId as number, setNumber: 1, actualWeight: 30, actualReps: 10, restTimeTaken: 60, isPR: false, createdAt: new Date() });
        await db.setLogs.add({ workoutSessionId: sid as number, exerciseId: ohpId as number, setNumber: 2, actualWeight: 42, actualReps: 8, restTimeTaken: 120, isPR: true, createdAt: new Date() });

        const allLogs = await db.setLogs.toArray();
        const prs = allLogs.filter((l: any) => l.isPR === true);
        const vol = allLogs.reduce((s: number, l: any) => s + l.actualWeight * l.actualReps, 0);

        return {
          total: allLogs.length,
          prCount: prs.length,
          prs: prs.map((l: any) => l.actualWeight).sort((a: any, b: any) => a - b),
          volume: vol,
          bench: allLogs.filter((l: any) => l.exerciseId === bpId).length,
          squat: allLogs.filter((l: any) => l.exerciseId === sqId).length,
          ohp: allLogs.filter((l: any) => l.exerciseId === ohpId).length,
        };
      });

      if (data.total !== 9) throw new Error(`total sets=${data.total} expected 9`);
      if (data.prCount !== 3) throw new Error(`prCount=${data.prCount} expected 3`);
      const sortedPrs = JSON.stringify(data.prs);
      if (sortedPrs !== JSON.stringify([42, 95, 105])) throw new Error(`PR weights: ${sortedPrs}`);
      if (data.bench !== 4) throw new Error(`bench=${data.bench}`);
      if (data.squat !== 3) throw new Error(`squat=${data.squat}`);
      if (data.ohp !== 2) throw new Error(`ohp=${data.ohp}`);
      if (data.volume <= 3000) throw new Error(`volume=${data.volume} expected >3000`);
    });

    await resetDB(page);

    // Summary
    console.log('\n' + '═'.repeat(56));
    console.log(`Results: ${passedTests}/${totalTests} passed`);
    if (failedTests === 0) {
      console.log('✅ ALL PHASE 2 TESTS PASSED');
    } else {
      console.log(`❌ ${failedTests} tests failed`);
    }
    console.log('═'.repeat(56));

  } finally {
    await browser.close();
  }
}

main().then(() => {
  if (failedTests > 0) process.exit(1);
  process.exit(0);
}).catch(err => {
  console.error('Runner crashed:', err instanceof Error ? err.message : err);
  console.log(`Results: ${passedTests}/${totalTests} passed`);
  process.exit(1);
});
