# Spottr Implementation Plan

**Project:** Spottr - Gym Workout PWA
**Tech Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Dexie.js
**Target:** GitHub Pages PWA deployment
**Date:** 2026-03-31

**Detailed UX/UI Spec:** See [`features-screens.md`](./features-screens.md) for complete screen descriptions, user flows, and visual design.

---

## Phase 1: Project Foundation & Setup (Day 1)

**Related:** [features-screens.md](./features-screens.md) - visual design & user flows

### 1.1 Initialize Vite + React Project
```bash
npm create vite@latest spottr -- --template react-ts
cd spottr
npm install
```

### 1.2 Install Core Dependencies
```bash
# State Management
npm install zustand

# Database
npm install dexie dexie-react-hooks

# PWA
npm install vite-plugin-pwa workbox-window

# Styling
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Media & Export
npm install jszip
npm install --save-dev @types/jszip

# Utilities
npm install date-fns uuid
npm install --save-dev @types/uuid
```

### 1.3 Configure Tailwind + Glassmorphism
**File:** `tailwind.config.js`
- Add custom colors for glassmorphism palette
- Extend theme with border radius, box shadows, backdrop blur utilities

**File:** `src/styles/glassmorphism.css`
- CSS variables for background gradient, glass effects, accent colors
- Keyframe animations for floating blobs
- Component classes: `.glass-card`, `.glass-button`, `.glass-input`

### 1.4 Set Up Project Structure
```
src/
├── components/
│   ├── common/
│   │   ├── GlassCard.tsx
│   │   ├── GlassButton.tsx
│   │   └── GradientText.tsx
│   ├── workout/
│   │   ├── WorkoutList.tsx
│   │   ├── WorkoutExecutor.tsx
│   │   ├── ExerciseMedia.tsx
│   │   ├── SetEntry.tsx
│   │   └── RestTimer.tsx
│   ├── exercise/
│   │   ├── ExerciseLibrary.tsx
│   │   ├── ExerciseEditor.tsx
│   │   └── MediaUploader.tsx
│   ├── gym/
│   │   ├── GymList.tsx
│   │   └── GymEditor.tsx
│   └── layout/
│       ├── Header.tsx
│       └── Navigation.tsx
├── db/
│   ├── schema.ts
│   └── useDb.ts
├── hooks/
│   ├── useWorkoutSession.ts
│   └── useMediaCompression.ts
├── store/
│   └── useAppStore.ts        # Zustand global store
├── utils/
│   ├── mediaCompress.ts
│   ├── exportImport.ts
│   └── progressiveOverload.ts
├── types/
│   └── index.ts
├── styles/
│   └── glassmorphism.css
├── App.tsx
├── main.tsx
└── index.css
```

---

## Phase 2: Database Layer with Dexie.js (Day 1-2)

**Related:** [features-screens.md](./features-screens.md) - data model matches tables exactly

### 2.1 Define TypeScript Types (`src/types/index.ts`)
```typescript
export type MediaType = 'image' | 'video';

export interface Gym {
  id?: number;
  name: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  createdAt: Date;
}

export interface ExerciseDefinition {
  id?: number;
  name: string;
  notes?: string;
  createdAt: Date;
}

export interface ExerciseMedia {
  id?: number;
  exerciseId: number;
  localFilePath: string; // blob URL or IndexedDB key
  mediaType: MediaType;
  sortOrder: number;
  createdAt: Date;
}

export interface Workout {
  id?: number;
  gymId: number;
  name: string;
  createdAt: Date;
}

export interface WorkoutExercise {
  id?: number;
  workoutId: number;
  exerciseId: number;
  orderIndex: number;
  // No aggregate targets - per-set targets stored separately
}

export interface WorkoutSetTarget {
  id?: number;
  workoutExerciseId: number;
  setNumber: number; // 1-indexed position within this exercise
  targetReps: number;
  targetWeight: number;
  targetWeightUnit: 'kg' | 'lbs';
}

export interface WorkoutSession {
  id?: number;
  workoutId: number;
  startTime: Date;
  endTime?: Date;
}

export interface SetLog {
  id?: number;
  workoutSessionId: number;
  exerciseId: number;
  setNumber: number;
  actualWeight: number;
  actualReps: number;
  restTimeTaken?: number; // seconds
  isPR: boolean; // true if this set exceeded the exercise's historical max at time of logging
  createdAt: Date;
}
```

### 2.2 Create Dexie Schema (`src/db/schema.ts`)
```typescript
import Dexie, { Table } from 'dexie';
import {
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
    // Define tables with indexes
    this.version(1).stores({
      gyms: '++id, name',
      exerciseDefinitions: '++id, name',
      exerciseMedia: '++id, exerciseId, mediaType',
      workouts: '++id, gymId, name',
      workoutExercises: '++id, workoutId, exerciseId, orderIndex',
      workoutSetTargets: '++id, workoutExerciseId, setNumber',
      workoutSessions: '++id, workoutId, startTime, endTime',
      setLogs: '++id, workoutSessionId, exerciseId, setNumber, isPR',
    });
  }
}

export const db = new SpottrDatabase();
```

### 2.3 Create React Hook Wrapper (`src/db/useDb.ts`)
- Provide React context for database access
- Export typed hooks for each table (useGyms, useExercises, etc.)
- Include mutation helpers (addGym, updateWorkout, etc.)

---

## Phase 3: Core CRUD Components (Day 2-3)

**Related:** [features-screens.md](./features-screens.md) - screens: Gym Management (2), Exercise Library (3), Workout Builder (4), History (6)

### 3.1 Gym Management
- **GymList.tsx** - List all gyms, add new, edit, delete
- **GymEditor.tsx** - Form with name, address, location (optional lat/long)
- Store in IndexedDB via `useDb`

### 3.2 Exercise Library
- **ExerciseLibrary.tsx** - Searchable list of all exercises
- **ExerciseEditor.tsx** - Name, notes, media upload
- **MediaUploader.tsx** - Component to capture/upload images/videos with auto-compression (see Phase 4)

### 3.3 Workout Builder
- **WorkoutList.tsx** - List workout templates
- **WorkoutBuilder.tsx** - Create/edit workout:
  - Select gym
  - Add exercises from global library
  - For each exercise, configure **individual set targets**:
    - Display list of sets (each with reps, weight, unit)
    - "Add Set" button to add another set
    - Up/down arrows to reorder sets within the exercise
    - Delete button per set (cannot delete last set)
    - Edit inputs for reps/weight/unit per set
  - Reorder exercises using up/down arrow buttons (no drag-and-drop for performance)
  - Save workout template (creates Workout record + WorkoutExercise + associated WorkoutSetTarget records)

### 3.4 Layout Components
- **Header.tsx** - App bar with title "Spottr"
- **Navigation.tsx** - Bottom glass tab bar (5 items) with:
  - Inactive: translucent, muted text
  - Active: semi-transparent gradient fill + white/gradient text
  - **Workouts tab special:** gradient border with gentle 3s pulse animation (always visible), see features-screens.md
- **GlassCard, GlassButton, GradientText** - reusable components for consistent glassmorphism

**Implementation:** Phase 3 builds these components with Tailwind CSS; gradient border uses `bg-clip: padding-box` + pseudo-element for pulse.

---

## Phase 4: Media Handling & Compression (Day 3-4)

**Related:** [features-screens.md](./features-screens.md) - Exercise Library (3) media upload, Workout Execution (5) media display

### 4.1 Media Capture Component
**File:** `src/utils/mediaCompress.ts`
- `compressImage(file: File, maxWidth = 1920, quality = 0.8)` → Blob
- `compressVideo(file: File, maxHeight = 720, maxBitrate = 2_000_000)` → Blob
  - Uses browser's `Video` element + `Canvas` to scale resolution and re-encode via `MediaRecorder` with constrained bitrate
  - **Aggressive compression:** 720p, 1-2 Mbps, to minimize storage footprint while maintaining usability
  - Fallback: If compression fails, store original (with user warning about storage)

### 4.2 Storage Strategy
- Store compressed media blobs in IndexedDB as `Blob` objects (Dexie supports Blob directly)
- `localFilePath` field will store the blob directly (Dexie handles Blob storage transparently)
- **Storage quota considerations:** Browser quotas vary by platform (Chrome desktop effectively unlimited; mobile/Safari more restrictive). Mitigations:
  - Use `navigator.storage.estimate()` to display actual usage in UI
  - Implement per-video size limit (50MB after compression)
  - Show warning when usage exceeds 80% of quota
  - Allow export/import as archival/cleanup escape hatch
  - Auto-detection of orphaned media for cleanup
  - Optional aggressive compression tiers if storage gets constrained
- For PWA offline use, blobs persist in browser storage across sessions

### 4.3 Media Display
- `ExerciseMedia.tsx` component:
  - Fetches blob from IndexedDB
  - Creates object URL (`URL.createObjectURL(blob)`) for `<img>` or `<video>`
  - Clean up URLs on unmount to prevent memory leaks

---

## Phase 5: Workout Execution Flow (Day 4-5)

**Related:** [features-screens.md](./features-screens.md) - complete Workout Execution screen flow (5), including progressive overload and PR celebrations

### 5.1 Session Management Hook
**File:** `src/hooks/useWorkoutSession.ts`
```typescript
const useWorkoutSession = (workoutId: number) => {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[]>([]);

  const startSession = async () => {
    const sessionId = await db.workoutSessions.add({
      workoutId,
      startTime: new Date(),
    });
    setSession({ id: sessionId, workoutId, startTime: new Date() });
  };

  const completeSet = async (exerciseId: number, actualWeight: number, actualReps: number) => {
    await db.setLogs.add({
      workoutSessionId: session!.id,
      exerciseId,
      setNumber: setLogs.length + 1,
      actualWeight,
      actualReps,
      createdAt: new Date(),
    });
    // Refresh logs
  };

  const advanceExercise = () => setCurrentExerciseIndex(prev => prev + 1);
  const endSession = async () => {
    await db.workoutSessions.update(session!.id, { endTime: new Date() });
  };
};
```

### 5.2 Executor UI (`WorkoutExecutor.tsx`)
**Flow:**

1. **Ready Screen:** Select Workout → "Start Workout"
2. **Exercise View (Screen B):** For each exercise in sequence:
   - Show exercise name + media (video/image)
   - Current set indicator: "Set X of Y"
   - **Target display:** "8 reps @ 80kg" (shows target for *this specific set*)
   - **Start Set Flow:**
     - "Start Set" button opens a quick modal/dialog:
       - Shows: "Set X: 8 reps @ 80kg"
       - Three options:
         1. **"Start with Target"** - Accepts target as-is, begins set timer (if enabled)
         2. **"Edit & Start"** - Opens inputs to adjust weight/reps before starting (for PR attempts or warm-up adjustments)
         3. **"Cancel"** - Return to exercise view
       - **Progressive overload cue** is displayed in this modal if target weight > historical max: "🔥 PR potential: 80kg exceeds your max of 75kg!"
     - After starting: set in progress (timer running, "Complete Set" button)
     - Optional rest timer after completion
     - Navigation: "Previous Set" (if skipped), "Next Set" advance (usually after completion)
3. **Set Completion (Screen C):** After tapping "Complete Set" during the set:
   **Modal/Dialog:**
   - Shows: "Complete Set X of Y" with values used "8 reps @ 80kg"
   - Two primary buttons:
     1. **"✓ Completed"** - Saves set log with actual values (same as target), closes modal
     2. **"✎ Edit"** - Opens form to adjust Actual Weight & Actual Reps before saving (if actual differs from target)
   - **PR celebration:** If the actual weight saved exceeds historical max, trigger confetti overlay automatically
   - **Post-PR prompt:** After celebration, show an additional question: "Save {new weight}kg as new target for this set in your workout template?" with buttons "Yes, update template" / "No, keep original"
     - If "Yes": update the corresponding `WorkoutSetTarget` record for this exercise+set number with the new weight/reps
     - This ensures next time you do that workout, you automatically target the PR weight
   - After any choice: returns to Screen B (next set or exercise complete)

4. **Exercise Complete (Screen D):** Summary + "Continue"
5. **Workout Complete (Screen E):** Final summary + "Save & Exit"

**Data:** During execution, load per-set targets from `workoutSetTargets` table (join via `workoutExercises`). Save actuals to `setLogs` with `isPR` flag.

### 5.3 Rest Timer Component
- Simple countdown timer (configurable duration)
- Pauses/resumes
- Optional sound notification (browser Audio API)

---

## Phase 6: Progressive Overload System (Day 5)

**Related:** [features-screens.md](./features-screens.md) - progressive overload cues during Set Start modal

### 6.1 Historical Max Calculation
**File:** `src/utils/progressiveOverload.ts`
```typescript
const getHistoricalMaxForExercise = async (exerciseId: number): Promise<number> => {
  const allSetLogs = await db.setLogs
    .where('exerciseId')
    .equals(exerciseId)
    .toArray();

  return Math.max(...allSetLogs.map(log => log.actualWeight), 0);
};

const getTargetForSet = async (workoutExerciseId: number, setNumber: number): Promise<{ reps: number; weight: number; unit: 'kg' | 'lbs' }> => {
  const target = await db.workoutSetTargets
    .where({ workoutExerciseId, setNumber })
    .first();

  if (!target) throw new Error('Set target not found');
  return { reps: target.targetReps, weight: target.targetWeight, unit: target.targetWeightUnit };
};
```

### 6.2 Cue Display Logic & PR Workflow
**When:** Cue displayed in "Start Set" modal (before set begins)
**Evaluation:** Compare the target weight of the *upcoming set* to the historical maximum for that exercise
- If `targetWeight > historicalMax`: show cue "🔥 PR potential: {target}kg > your max of {max}kg"

**Post-set PR handling (in Set Completion modal):**
1. User completes set, saves actualWeight/actualReps
2. If `actualWeight > historicalMax`:
   - Set `isPR = true` on the SetLog record
   - Trigger confetti overlay
   - Show brief "🎉 NEW PR!" notification
   - **Prompt:** "Save {actualWeight}kg as new target for this set in your workout template?" with buttons "Yes, update template" / "No, keep original"
     - If Yes: update the corresponding `WorkoutSetTarget` record (for this `workoutExerciseId` and `setNumber`) with new `targetWeight` and `targetReps` (use actual values)
3. Return to Exercise View

**Integration:** In `useWorkoutSession` hook:
- Compute historical max when loading an exercise
- Fetch per-set target for current set from `workoutSetTargets`
- After set save: recompute historical max (includes new PR if applicable), set `isPR` flag, conditionally prompt for template update
- The `isPR` flag enables fast queries for "Recent PRs" dashboard

---

## Phase 7: Export/Import Feature (Day 6)

**Related:** [features-screens.md](./features-screens.md) - Settings (7) Storage Management section

### 7.1 Export Function (`src/utils/exportImport.ts`)
```typescript
import JSZip from 'jszip';

const exportDatabase = async (): Promise<Blob> => {
  const zip = new JSZip();

  // 1. Export all tables as JSON
  const gyms = await db.gyms.toArray();
  const exerciseDefinitions = await db.exerciseDefinitions.toArray();
  const exerciseMedia = await db.exerciseMedia.toArray();
  const workouts = await db.workouts.toArray();
  const workoutExercises = await db.workoutExercises.toArray();
  const workoutSetTargets = await db.workoutSetTargets.toArray();
  const workoutSessions = await db.workoutSessions.toArray();
  const setLogs = await db.setLogs.toArray();

  zip.file('gyms.json', JSON.stringify(gyms));
  zip.file('exerciseDefinitions.json', JSON.stringify(exerciseDefinitions));
  zip.file('workouts.json', JSON.stringify(workouts));
  zip.file('workoutExercises.json', JSON.stringify(workoutExercises));
  zip.file('workoutSetTargets.json', JSON.stringify(workoutSetTargets));
  zip.file('workoutSessions.json', JSON.stringify(workoutSessions));
  zip.file('setLogs.json', JSON.stringify(setLogs));

  // 2. Export media blobs
  const mediaFolder = zip.folder('media');
  if (mediaFolder) {
    for (const media of exerciseMedia) {
      const blob = await db.exerciseMedia.getBlob(media.id!); // Hypothetical; Dexie stores Blobs directly
      // Need to extract blob from IndexedDB - may need custom query
      // Alternative: store media as separate files in IndexedDB with known keys
      mediaFolder.file(`${media.id}.${media.mediaType === 'video' ? 'mp4' : 'jpg'}`, blob);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
};
```

**Note:** Dexie stores Blobs natively, but retrieving them as Blob objects may require `db.exerciseMedia.get(id).then(media => media.localFilePath as Blob)` if stored directly. Need to test exact API.

### 7.2 Import Function
- User selects ZIP file via `<input type="file">`
- Parse ZIP, read JSON files, clear existing DB (or merge strategy)
- Insert records in dependency order: Gyms → ExerciseDefinitions → Workouts → WorkoutExercises → WorkoutSetTargets → WorkoutSessions → SetLogs
- Store media blobs in IndexedDB

### 7.3 UI
- "Export Backup" button → triggers download
- "Import Backup" button → file picker → shows confirmation dialog

---

## Phase 8: PWA Configuration (Day 6)

**Related:** [features-screens.md](./features-screens.md) - PWA Install Prompt (8), Storage Management UI (7)

### 8.1 Asset Generation: Icons & Splash Screens
**Design:** Create master icon (1024×1024 PNG) with glassmorphism style:
- Background gradient matching app theme (#0f172a to #1e293b)
- "S" letter logo in white/cyan with subtle glow
- Keep design simple for readability at small sizes

**Icons required:**
- `pwa-192x192.png` - Android home screen
- `pwa-512x512.png` - Android splash (auto-generated) + Play Store
- `apple-touch-icon.png` (180×180) - iOS home screen
- `favicon.ico` (16×16, 32×32) - browser tab
- Optional: generate additional sizes (72, 96, 128, 144, 152, 384) for completeness

**Script:** Use `sharp` or Node canvas to resize master icon to all required dimensions.

**iOS Splash Screens (focus effort here):**
- Design full-screen splash template with gradient background + centered logo (larger than icon)
- Generate device-specific sizes:
  - 640×1136 (iPhone 5/SE)
  - 750×1334 (iPhone 6/7/8)
  - 1125×2436 (iPhone X/XS/11 Pro)
  - 1242×2688 (iPhone XS Max/11 Pro Max)
  - 1536×2048 (iPad)
- Save to `public/splash/`
- Add `<link rel="apple-touch-startup-image">` tags in `index.html` for each size with appropriate media queries

**Android handling:** No custom splash needed. Chrome automatically generates splash using `manifest.background_color` (#0f172a) + the 512×512 icon. This is acceptable and requires no extra effort.

**Placement:** All assets in `public/` (Vite serves static files from here).

### 8.2 VitePWA Plugin
**File:** `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Spottr - Workout Tracker',
        short_name: 'Spottr',
        description: 'Glassmorphism gym workout PWA',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ],
});
```

### 8.3 Service Worker Behavior
- Cache app shell (JS, CSS, HTML) for offline launch
- No API caching needed (local-only app)
- Precache manifest generated automatically

### 8.4 Install Prompt
- Detect `beforeinstallprompt` event
- Show "Install Spottr" button in UI (bottom nav or modal)
- On click, trigger prompt
- After install, show confirmation toast

---

## Phase 9: Testing, Polish & Accessibility (Day 7)

**Related:** [features-screens.md](./features-screens.md) - all screens verification (glassmorphism, edge cases, accessibility)

### 9.1 Responsive Testing
- Mobile-first design (375px - 768px)
- Tablet (768px - 1024px)
- Desktop (1024px+)
- Test PWA install on Android/iOS Safari

### 9.2 Performance
- Audit bundle size (<200KB gzipped goal)
- Code splitting by route (React.lazy + Suspense)
- Lazy load media components

### 9.3 Glassmorphism Implementation Review
- Verify all design tokens from `gym-workout-app-requirements.md`:
  - Background gradient
  - Glass card translucency, borders, shadows
  - Blob animations (3 floating circles)
  - Button gradients and hover effects
  - Typography (Playfair Display for headings, Inter for body)

### 9.4 Edge Cases
- What happens if IndexedDB is full? Show error message
- Media compression failures? Fallback to original
- Session interruption? Auto-save partial logs, allow resume

### 9.5 Accessibility
- Focus states (accent outline)
- Keyboard navigation (tab order)
- Screen reader labels for media uploads, set inputs
- Color contrast verification

---

## Phase 10: GitHub Pages Deployment (Day 7)

### 10.1 Build Configuration
**File:** `.github/workflows/deploy.yml`
```yaml
name: Deploy to GitHub Pages

on:
  push:
    brances: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### 10.2 Base Path Configuration
- In `vite.config.ts`, set `base: '/spottr/'` (since repo name ≠ username.github.io)
- Ensure all asset paths are relative

### 10.3 Final Verification
- `npm run build` → inspect `dist/` folder
- Deploy to GitHub Pages (Settings → Pages → source: gh-pages branch)
- Access: `https://claireaicodes.github.io/spottr/`
- Test PWA install, offline functionality

---

## Phase 11: Documentation & Handoff (Day 8)

### 11.1 README.md
- Project overview, tech stack
- How to run locally (`npm install && npm run dev`)
- How to build and deploy
- Data schema documentation
- Upgrade/import/export instructions

### 11.2 Code Documentation
- Comment complex functions
- Document Dexie schema relationships
- Provide example usage for key hooks

### 11.3 User Guide (Optional)
- Brief tutorial on using Spottr
- Screenshots of key flows

---

## Risk Mitigation & Decisions

### Decision: React vs Flutter
**Why React wins:**
- PWA-first with minimal bundle size
- No need for native app stores
- Glassmorphism design easier without fighting framework styles
- GitHub Pages hosting straightforward

### Decision: Dexie.js vs SQLite
**Why IndexedDB:**
- Browser-native, no WASM overhead
- Perfect for local-only PWA
- Dexie provides SQL-like query experience
- Blob storage for media works natively

### Decision: Media Storage Strategy (Blobs in IndexedDB)
**Why blobs are correct:**
- Only practical browser-native option for binary data
- Direct storage without base64 overhead
- Works with Dexie transactions
- Portable in ZIP exports (extracted as files)

**Mitigations for storage limits:**
- Aggressive video compression (720p, 1-2 Mbps)
- Per-video size limit (50MB after compression)
- Storage usage indicator + warnings at 80% full
- Export/import as escape hatch for archival
- Clear unused media option in settings

### Decision: State Management
**Zustand** - 1KB, no boilerplate, separate from persistent DB

### Decision: Workout Reordering
**Up/down arrows** - zero lag, simple implementation, no drag-and-drop overhead

### Decision: Units
**Added `targetWeightUnit`** to WorkoutExercise - necessary for international users (kg vs lbs)

### Decision: Gym Geolocation
**Free browser API + Google Maps URL** - Use browser's Geolocation API to capture lat/long, then generate `https://www.google.com/maps/search/?api=1&query={lat},{lon}` link. Optional reverse geocoding via OpenStreetMap Nominatim to fill address. Zero API costs.

### Decision: Start Workout CTA
**Elegant, not tacky** - Medium-sized glass card with gradient border or subtle glow, no pulsing. Clean premium feel.

### Decision: Home Dashboard Content
- **Remove:** Upcoming (no scheduler), storage indicator (not primary)
- **Keep:** Last Workout card, Recent PRs section (celebratory), optional quick stats strip
- **Primary action:** "Begin Workout" glass button

### Decision: Bottom Navigation Highlight
**Gradient border glow** - Workouts tab gets a 2px gradient border with gentle 3s pulse animation (always visible). Active state has semi-transparent fill. Distinction: glow = special feature, fill = active page.

---

## Success Criteria

1. ✅ **PWA installable** from GitHub Pages URL
2. ✅ **Offline-first** - app shell cached, workouts executable offline
3. ✅ **Glassmorphism UI** matches spec exactly
4. ✅ **Workout execution** complete with progressive overload cues and PR celebrations
5. ✅ **Media library** functional with image/video display
6. ✅ **Export/Import** ZIP containing all data + media
7. ✅ **GitHub Pages** deployment automated via Actions
8. ✅ **Bundle size** < 200KB gzipped (excluding media)

---

## Estimated Timeline: 7-8 Days

- Day 1: Setup + Database layer
- Day 2-3: CRUD components (Gyms, Exercises, Workouts)
- Day 3-4: Media handling
- Day 4-5: Workout execution UI
- Day 5: Progressive overload system
- Day 6: Export/import + PWA config
- Day 7: Testing, polish, accessibility
- Day 8: Deployment + documentation

---

**Ready to proceed, Master?** I can start with Phase 1 immediately (Green light - autonomous research and scaffolding). Should I begin scaffolding the React + Vite project with the complete structure and glassmorphism CSS base?