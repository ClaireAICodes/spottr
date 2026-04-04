import { useState, useEffect } from 'react';
import { db } from './db/schema.ts';

// Re-export all useDb members so we can verify they're accessible
import * as useDbModule from './db/useDb.ts';

// ============================================================
// Types
// ============================================================
interface TestResult {
  name: string;
  group: string;
  pass: boolean;
  detail: string;
}

// ============================================================
// Test Runner Component
// ============================================================
export default function TestVerifyPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    setDone(false);
    const r: TestResult[] = [];

    // Helper — push a result
    const ok = (group: string, name: string, cond: boolean, detail: string) => {
      r.push({ group, name, pass: cond, detail: cond ? detail : `FAIL — ${detail}` });
    };

    try {
      // Wipe any prior run data
      await db.delete();
      await db.open();

      /* ── 1. SCHEMA ─────────────────────────────── */
      const tables = db.tables.map((t) => t.name);
      ok('Schema', '8 tables present', tables.length === 8, `${tables.length}`);

      const wanted = [
        'gyms','exerciseDefinitions','exerciseMedia','workouts',
        'workoutExercises','workoutSetTargets','workoutSessions','setLogs',
      ];
      const missing = wanted.filter((t) => !tables.includes(t));
      ok(
        'Schema',
        'All required tables exist',
        missing.length === 0,
        missing.length ? `missing: ${missing.join(', ')}` : '✓',
      );

      /* ── 2. CRUD — CREATE FULL CHAIN ───────────── */
      const gymId = await db.gyms.add({
        name: 'Home Gym', address: 'Singapore', latitude: 1.3, longitude: 103.8, createdAt: new Date(),
      });
      ok('CRUD', 'create gym', typeof gymId === 'number' && gymId > 0, `id=${gymId}`);

      const exId = await db.exerciseDefinitions.add({
        name: 'Bench Press', notes: 'flat barbell', createdAt: new Date(),
      });
      ok('CRUD', 'create exercise', typeof exId === 'number' && exId > 0, `id=${exId}`);

      const wkId = await db.workouts.add({
        gymId: gymId as number, name: 'Push Day – Heavy', createdAt: new Date(),
      });
      ok('CRUD', 'create workout', typeof wkId === 'number' && wkId > 0, `id=${wkId}`);

      const wkExId = await db.workoutExercises.add({
        workoutId: wkId as number, exerciseId: exId as number, orderIndex: 0,
      });
      ok('CRUD', 'create workoutExercise', typeof wkExId === 'number' && wkExId > 0, `id=${wkExId}`);

      const tIds = await db.workoutSetTargets.bulkAdd([
        { workoutExerciseId: wkExId as number, setNumber: 1, targetReps: 15, targetWeight: 20, targetWeightUnit: 'kg' as const },
        { workoutExerciseId: wkExId as number, setNumber: 2, targetReps: 10, targetWeight: 60, targetWeightUnit: 'kg' as const },
        { workoutExerciseId: wkExId as number, setNumber: 3, targetReps: 8,  targetWeight: 80, targetWeightUnit: 'kg' as const },
        { workoutExerciseId: wkExId as number, setNumber: 4, targetReps: 6,  targetWeight: 90, targetWeightUnit: 'kg' as const },
      ]);
      ok('CRUD', 'bulk-add 4 set targets', tIds.length === 4, `${tIds.length} created`);

      /* ── 3. READ ───────────────────────────────── */
      const gym = await db.gyms.get(gymId as number);
      ok('Read', 'gym by ID', gym?.name === 'Home Gym', `"${gym?.name}"`);
      ok('Read', 'gyms coordinates preserved', gym?.latitude === 1.3, `${gym?.latitude}`);

      const exercise = await db.exerciseDefinitions.get(exId as number);
      ok('Read', 'exercise by ID', exercise?.name === 'Bench Press', `"${exercise?.name}"`);
      ok('Read', 'exercise notes preserved', exercise?.notes === 'flat barbell', `"${exercise?.notes}"`);

      const wk = await db.workouts.get(wkId as number);
      ok('Read', 'workout linked to correct gym', wk?.gymId === gymId, `gymId=${wk?.gymId}`);

      /* ── 4. COMPOUND INDEX ─────────────────────── */
      const s3 = await db.workoutSetTargets
        .where('[workoutExerciseId+setNumber]')
        .equals([wkExId as number, 3])
        .first();
      ok('Query', 'compound index [wkExId+set#] — set 3', s3?.targetWeight === 80 && s3?.targetReps === 8, `${s3?.targetReps}@${s3?.targetWeight}kg`);

      const allTargets = await db.workoutSetTargets
        .where('workoutExerciseId')
        .equals(wkExId as number)
        .sortBy('setNumber');
      ok('Query', 'sorted by setNumber', allTargets.length === 4 && allTargets[3].setNumber === 4, `${allTargets.map((s) => s.setNumber).join(',')}`);

      /* ── 5. SESSIONS & LOGS ────────────────────── */
      const sid = await db.workoutSessions.add({ workoutId: wkId as number, startTime: new Date() });
      ok('Sessions', 'start session', typeof sid === 'number' && sid > 0, `id=${sid}`);

      await db.setLogs.add({
        workoutSessionId: sid as number, exerciseId: exId as number,
        setNumber: 1, actualWeight: 60, actualReps: 10, restTimeTaken: 90, isPR: false, createdAt: new Date(),
      });

      await db.setLogs.add({
        workoutSessionId: sid as number, exerciseId: exId as number,
        setNumber: 2, actualWeight: 85, actualReps: 8, restTimeTaken: 120, isPR: true, createdAt: new Date(),
      });

      const logs = await db.setLogs.where('workoutSessionId').equals(sid as number).toArray();
      ok('Logs', 'logs by session', logs.length === 2, `${logs.length}`);

      const exLogs = await db.setLogs.where('exerciseId').equals(exId as number).toArray();
      ok('Logs', 'logs by exercise', exLogs.length === 2, `${exLogs.length}`);

      /* ── 6. PR FILTER ──────────────────────────── */
      const allSet = await db.setLogs.toArray();
      const prs = allSet.filter((l) => l.isPR === true);
      ok('PR', 'filter isPR=true', prs.length === 1, `${prs.length} PR(s)`);
      if (prs.length) ok('PR', 'PR has correct weight', prs[0].actualWeight === 85, `${prs[0].actualWeight}kg`);

      /* ── 7. BLOB STORAGE ───────────────────────── */
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const c = canvas.getContext('2d');
      c && c.fillRect(0, 0, 64, 64);
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png', 0.5));

      const mediaId = await db.exerciseMedia.add({
        exerciseId: exId as number, mediaBlob: blob, mediaType: 'image', sortOrder: 1, createdAt: new Date(),
      });
      ok('Blob', 'store image blob', typeof mediaId === 'number' && mediaId > 0, `id=${mediaId} size=${blob.size}`);

      const fetched = await db.exerciseMedia.get(mediaId as number);
      const retrieved = fetched?.mediaBlob;
      ok('Blob', 'retrieve as Blob', retrieved instanceof Blob, `${retrieved?.constructor.name}`);
      ok('Blob', 'size preserved', retrieved?.size === blob.size, `${retrieved?.size}/${blob.size}`);

      /* ── 8. DELETES ────────────────────────────── */
      const cb = await db.workouts.count();
      await db.workouts.delete(wkId as number);
      const ca = await db.workouts.count();
      ok('Delete', 'delete workout', ca === cb - 1, `${cb}→${ca}`);

      await db.exerciseMedia.delete(mediaId as number);
      ok('Delete', 'delete media', (await db.exerciseMedia.count()) === 0, 'count=0');

      /* ── 9. USEDB MODULE (export audit) ─────────── */
      const keys = Object.keys(useDbModule).filter((k) => typeof (useDbModule as any)[k] === 'function');
      ok('Module', `useDb exports ${keys.length} functions`, keys.length >= 20, `${keys.length}`);

      const needHooks = ['useGyms','useExercises','useExerciseMedia','useWorkouts','useWorkoutsByGym','useWorkout','useSessions','useRecentPRs'];
      for (const h of needHooks) ok('Module', `${h} exported`, typeof (useDbModule as any)[h] === 'function', h);

      /* ── 10. EMPTY-STATE QUERIES ───────────────── */
      const empty = await db.workoutSetTargets.where('[workoutExerciseId+setNumber]').equals([99999, 1]).first();
      ok('Edge', 'empty compound query → undefined', empty === undefined, `${empty}`);

      /* ── done ───────────────────────────────────── */
      await db.delete(); // clean up after run
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Test run error:', err);
      ok('RUNTIME', 'unhandled error', false, msg);
    }

    setResults(r);
    setRunning(false);
    setDone(true);
  };

  /* Auto-run once on mount */
  useEffect(() => { runTests(); }, []);

  /* ── render ──────────────────────────────────── */
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const allPass = failed === 0;
  const groups = Array.from(new Set(results.map((r) => r.group)));

  return (
    <div className="relative min-h-screen pb-16">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-10">
        <h1
          className="text-4xl sm:text-5xl font-extrabold mb-3 text-center"
          style={{
            fontFamily: "'Playfair Display', serif",
            background: "linear-gradient(135deg,#fff 0%,var(--accent) 50%,#a78bfa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Spottr — Phase 2 DB Tests
        </h1>

        <p className="text-slate-400 text-center mb-8">Dexie.js schema, CRUD, &amp; hooks verification</p>

        <div className="flex justify-center mb-8">
          <button className="glass-button opacity-90 hover:opacity-100" onClick={runTests} disabled={running}>
            {running ? '⏳ Running…' : '🔄 Re-run'}
          </button>
        </div>

        {done && (
          <div className={`text-center mb-8 text-lg font-semibold ${allPass ? 'text-emerald-400' : 'text-red-400'}`}>
            {allPass ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}{' '}
            <span className="text-slate-400 font-normal text-base">({passed}✓ {failed}✗ — {results.length} total)</span>
          </div>
        )}

        {running && (
          <div className="text-center text-accent animate-pulse">Running database tests…</div>
        )}

        {groups.map((g) => (
          <details key={g} className="glass-card mb-4 cursor-pointer" open>
            <summary className="font-semibold text-lg mb-3 select-none" style={{ fontFamily: "'Playfair Display', serif" }}>
              {g}
            </summary>
            <div className="space-y-2 mt-2">
              {results
                .filter((r) => r.group === g)
                .map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2 rounded text-sm ${r.pass ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <span>{r.pass ? '✅' : '❌'}</span>
                    <div className="font-mono flex-1">
                      <div className="text-white">{r.name}</div>
                      {!r.pass && <div className="text-red-400 text-xs mt-0.5">{r.detail}</div>}
                    </div>
                  </div>
                ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
