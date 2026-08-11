# Spottr - Main Screens & Features Specification

**Document Version:** 1.0
**Date:** 2026-03-31
**Related:** [Implementation Plan](../implementation-plan.md)

---

## Visual Identity & UX Philosophy

**Look & Feel:** Premium, clean, modern - light-mode glassmorphism as specified:
- Deep blue-navy gradient background (#0f172a → #1e293b) with 3 subtle floating blur blobs
- All content panels are frosted-glass cards: semi-transparent white/blue tint, soft borders, subtle shadow
- Typography: **Playfair Display** (700/800) for headings, **Inter** (400/600) for body
- Accent color: Sky blue (#38bdf8) with glow effects
- Buttons: Rounded-full, gradient from accent to indigo, lift on hover

**Vibe:** Sleek, high-end fitness app - feels like you're wearing a Rolex, not a Fitbit.

---

## Main Screens & Features

### 1. Home / Dashboard

**Purpose:** Quick overview + one-tap access to start workouts

**Layout:**
- **Header:** App title "Spottr" (Playfair Display, gradient text), no subtitle
- **Main Content (scrollable):**

  **1. Last Workout Card** (glass panel)
  ```
  Last Workout
  Chest Day
  3 days ago • 4 exercises | 12 sets • 3 PRs
  [View Details]
  ```
  - Shows most recent completed workout (name, time ago, exercise count, PR count)
  - Pulls from WorkoutSessions + SetLogs
  - Subtle accent top border

  **2. Recent PRs Section** (celebratory glass panel)
  ```
  🎉 Recent PRs
  ┌─────────┬─────────┐
  │ Bench   │ 100kg   │
  │ Squat   │ 120kg   │
  │ OHP     │ 60kg    │
  └─────────┴─────────┘
  [View All PRs]
  ```
  - Horizontal scroll or small grid of recent PR cards (last 5-7)
  - Each card: Exercise name + new weight + date (small)
  - Trophy icon or gradient accent
  - Fetches SetLogs where `isPR = true`

  **3. Start Workout CTA** (elegant glass card)
  ```
  ┌─────────────────────┐
  │   ➤ Begin Workout   │
  └─────────────────────┘
  ```
  - Medium-sized, not oversized or pulsing
  - Gradient border or subtle glow
  - Centered with generous padding
  - Hover: slight lift + stronger shadow
  - Could show "Continue: [Workout Name]" if incomplete session exists

  **4. Quick Stats Strip** (optional, very lightweight)
  ```
  [12 workouts this month]  [5 week streak 🔥]  [35 total PRs]
  ```
  - Small, muted text; only if data exists

- **Bottom Navigation Bar:** (glass tabs, fixed at bottom)
  ```
  Home | Exercises | Workouts ⬡ | History | Settings
  ```
  - 5 equally-spaced items with icons + labels
  - **Workouts tab special treatment:** gradient border with gentle pulse animation (Option A)
  - Inactive: translucent, muted text
  - Active: semi-transparent gradient fill + white/gradient text
  - Distinction: Workouts has glowing border always; active state has fill

**Implementation:** Phase 1 (glassmorphism CSS base), Phase 3 (dashboard components), Phase 8 (PWA UI)

---

### 2. Gym Management

**Access:** Settings → Manage Gyms

**Purpose:** Define where you work out

**Features:**

#### Gym List
- List of gyms with name, address (if available), and location status
- Each entry shows:
  - Gym name (bold)
  - Address line (truncated if long)
  - If coordinates exist: small "View on Map" link
- Actions: Add new, Edit, Delete

#### Gym Editor (Add/Edit)
**Form fields:**
- **Name** (required) - text input
- **Address** (optional) - textarea for manual entry
- **Location** section:
  - Button: "📍 Use Current Location" → triggers browser Geolocation API
  - After successful location capture:
    - Display: `Latitude: 1.234567, Longitude: 103.123456`
    - Link: "Open in Maps" → opens `https://www.google.com/maps/search/?api=1&query={lat},{lon}` in new tab
    - Button: "Fetch Address from Coordinates" (optional) → calls Nominatim (OpenStreetMap) reverse geocoding to populate Address field (free, requires internet)
  - Manual coordinates (optional, always available):
    - Latitude input (number)
    - Longitude input (number)
- Save / Cancel buttons

**Storage:** Name, address (string), latitude (number, optional), longitude (number, optional)

**UX notes:**
- "Use Current Location" requires user permission; handle denial gracefully
- If location is acquired, lat/long fields are auto-filled but can be manually adjusted
- "Open in Maps" link always available if coordinates exist
- Reverse geocoding is opportunistic - may fail or return no address; keep existing address if present

**Implementation:** Phase 3 (GymList, GymEditor components), Phase 2 (db schema)

---

### 3. Exercise Library

**Access:** Main Tab (Library)

**Purpose:** Browse, search, and manage all exercises

**Layout:**
- Search bar at top (glass input)
- Filter by muscle group (tags: Chest, Back, Legs, Shoulders, Arms, Core, Cardio)
- Grid of exercise cards (2-column on mobile, 3-4 on desktop):
  - Each card: exercise name, small thumbnail (first media item), "Edit" button
- Floating action button: "Add New Exercise"

**Exercise Detail View:**
- Large media display: swipeable image/video gallery
- Exercise name (Playfair Display heading)
- Notes section
- Media list with thumbnails (add/delete/reorder)
- Back button to library

**Media Upload Flow:**
- "Add Media" button → file picker OR camera capture
- Compression progress indicator
- After upload: optional edit title/notes, save

**Implementation:** Phase 3 (ExerciseLibrary, ExerciseEditor, MediaUploader), Phase 4 (media compression and storage)

---

### 4. Workout Builder

**Access:** Home → "Build Workout"

**Purpose:** Assemble exercise templates (recipes) with flexible per-set targets

**Layout:**
1. Select Gym (dropdown)
   - Option to create new gym if necessary
2. Name the workout (e.g., "Push Day - Heavy")
3. Add exercises from library (search + multi-select)
   - Option to create new exercise if not in library
4. For each exercise, configure **individual sets**:
   - Exercise name + small media preview
   - List of sets (each set card shows: Set #, Target Reps, Target Weight + unit)
   - "Add Set" button (adds another set with default values)
   - For each set:
     - Up/Down arrows to reorder sets within this exercise
     - Delete button (cannot delete last set)
     - Edit: reps input, weight input
   - "Delete Exercise" button (removes entire exercise from workout)
5. Save button

**Note:** Sets can vary - e.g., warm-up (15 reps @ 20kg), working (8 reps @ 80kg), drop-set (12 reps @ 60kg). Total sets per exercise is flexible.

**Validation:** At least 1 exercise, each exercise has at least 1 set, all set targets filled.

**Implementation:** Phase 3 (WorkoutBuilder component), Phase 2 (db schema - see WorkoutSetTarget table)

---

### 5. Workout Execution Flow

**Access:** Home → "Start Workout" → Select template → Begin

**Screen Sequence:**

#### Screen A: Ready Screen
- Workout name, gym, estimated duration
- List of exercises with set counts (e.g., "Bench Press - 4 sets")
- "Start Workout" big button

#### Screen B: Exercise View (repeats per exercise)
- Exercise name (large heading)
- Media display (video/image, auto-play if video, loop)
- Current set indicator: "Set 2 of 4"
- **Target display:** "8 reps @ 80kg" (shows target for *this specific set*)

**Start Set Flow:**
- "Start Set" button opens a quick modal/dialog:
  - Shows: "Set 2: 8 reps @ 80kg"
  - Three options:
    1. **"Start with Target"** - Accepts target as-is, begins set timer (if enabled)
    2. **"Edit & Start"** - Opens inputs to adjust weight/reps before starting (for PR attempts or warm-up adjustments)
    3. **"Cancel"** - Return to exercise view
- **Progressive overload cue** is displayed in this modal if target weight > historical max: "🔥 PR potential: 80kg exceeds your max of 75kg!"

After starting, screen B shows set in progress (timer running, "Complete Set" button).

**Rest timer (optional, after set completion):** counts down, pause/resume, sound

**Navigation:** "Previous Set" (if skipped), "Next Set" advance (usually after completion)

#### Screen C: Set Completion (quick flow)
After tapping "Complete Set" during the set:

**Modal/Dialog:**
- Shows: "Complete Set 2 of 4" with values used "8 reps @ 80kg"
- Two primary buttons:
  1. **"✓ Completed"** - Saves set log with actual values (same as target), closes modal
  2. **"✎ Edit"** - Opens form to adjust Actual Weight & Actual Reps before saving (if actual differs from target)
- **PR celebration:** If the actual weight saved exceeds historical max, trigger confetti overlay automatically
- **Post-PR prompt:** After celebration, show an additional question: "Save {new weight}kg as new target for this set in your workout template?" with buttons "Yes, update template" / "No, keep original"
  - If "Yes": update the corresponding `WorkoutSetTarget` record for this exercise+set number with the new weight/reps
  - This ensures next time you do this workout, you automatically target the PR weight
- After any choice: returns to Screen B (next set or exercise complete)

**UX principle:** Most sets are performed as prescribed - one-tap completion. PR is recorded automatically when actual weight beats historical max, regardless of whether you explicitly "attempted" a PR.

#### Screen D: Exercise Complete
- Summary: "Completed 4 sets, total volume: 3200kg"
- Show any PRs achieved
- "Continue to Next Exercise" button

#### Screen E: Workout Complete
- Final summary: Total exercises, sets, volume, PRs earned
- "Save & Exit" (creates WorkoutSession record)
- Feedback: "Great job! 💪"

**Implementation:** Phase 5 (WorkoutExecutor, SetEntry, RestTimer, useWorkoutSession hook)

---

### 6. Workout History

**Access:** Tab (History)

**Purpose:** Review past performances

**Layout:**
- Calendar view (month grid) - days with workouts highlighted
- Tap day → list of sessions that day
- Session detail: workout name, start/end time, total volume, expanded set logs
- Swipe to delete with confirmation

**Implementation:** Phase 3 (history components), Phase 2 (queries on setLogs and sessions)

---

### 7. Settings / Management

**Access:** Tab (Settings)

**Sections:**

#### Storage Management
- Storage usage bar (quota vs used)
- List of media with size, delete individual
- "Clear Orphaned Media" button
- "Export Full Backup" (download ZIP)
- "Import Backup" (file picker)

#### App Settings
- Rest timer default duration
- Default weight unit (kg/lbs)
- Enable/disable progressive overload cues
- Enable/disable PR celebrations
- Aggressive compression toggle (for low-storage devices)

#### Data Management
- "Reset All Data" (with warning)
- "View Logs" (debug)

**Implementation:** Phase 6 (export/import), Phase 8 (storage UI), scattered settings UI in Phase 3

---

### 8. PWA Install Prompt

**Behavior:**
- When criteria met (visited twice, manifest valid), show install banner
- "Add to Home Screen" button
- Once installed, runs fullscreen without browser UI
- Create custom detection and prompt to handle iOS

**Implementation:** Phase 8 (service worker, manifest, install detection)

---

## Edge Cases & UX Details

- **Offline:** App shell cached, fully functional offline after first load
- **Unsaved Changes:** Modal warning before navigation
- **Empty States:** Friendly illustrations/text when no data
- **Loading:** Skeleton screens, spinners
- **Errors:** Toast notifications (e.g., "Storage full - export or delete media")
- **Accessibility:** Focus rings, ARIA labels, screen reader announcements
- **Storage Quota:** Display actual usage via `navigator.storage.estimate()`

---

## Navigation Structure

**Bottom Navigation (persistent):**
- Home (Dashboard)
- Library (Exercise Library)
- History
- Settings

**Modal/Full-Screen Flows:**
- Workout Execution (full screen takeover)
- Exercise Detail (modal)
- Workout Builder (full page)
- Settings subscreens

---

## Feature Checklist

| Feature | Phase | Status |
|---------|-------|--------|
| Glassmorphism UI base | 1 | planned |
| Gym CRUD | 3 | planned |
| Exercise Library (search, grid) | 3 | planned |
| Media upload & compression | 4 | planned |
| Workout Builder (up/down reorder) | 3 | planned |
| Execution flow (A-E screens) | 5 | planned |
| Progressive overload cues | 5 | planned |
| PR celebrations | 5 | planned |
| Rest timer | 5 | planned |
| History calendar view | 3 | planned |
| Export/Import ZIP | 6 | planned |
| Storage management UI | 8 | planned |
| PWA install | 8 | planned |
| GitHub Pages deployment | 10 | planned |

---

**This document provides the detailed UX/UI specification. See [`implementation-plan.md`](../implementation-plan.md) for phase-by-phase technical implementation.**
