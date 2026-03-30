# Gym Workout App - Comprehensive Development Prompt

## Project Overview

Build a **Flutter-based Progressive Web App (PWA)** for gym workout planning, execution, and tracking. The app targets mobile-first usage (phones at the gym) with a premium light-mode glassmorphism design. It enables users to create detailed workout plans, log sets in real-time, track progressive overload, and maintain an exercise library with machine photos/settings. Data is stored locally in SQLite and can be fully exported/imported via ZIP for backup and device migration.

## User & Context

- **Primary User:** Phil (Master Phil), corporate trainer, weekly gym-goer, interested in efficiency, automation, and data-driven fitness.
- **Pain Points:** Lack of time and mental capacity; wants to eliminate manual workout tracking friction; needs clear, glanceable guidance at the gym; wants progressive overload tracking to be easy and motivating.
- **Technical Preferences:** Mobile-first PWA (app stores later); local storage with optional future cloud sync; embedded media (photos/videos) within the app data; glassmorphism UI with fluid animations; light mode only.

## Core Data Model

```
Workout (has many Exercises)
  - title
  - description (optional)
  - gym_id (FK to Gym)
  - scheduled_date (optional)
  - notes

Exercise (belongs to a global ExerciseDefinition or custom copy; has many Sets)
  - exercise_definition_id (nullable, references global ExerciseDefinition)
  - custom_copy (boolean flag)
  - order (position within workout)
  - Sets (list)

Set
  - set_number
  - target_reps
  - target_weight
  - actual_reps (logged)
  - actual_weight (logged)
  - warmup (boolean)
  - completed (boolean)
  - notes

ExerciseDefinition (global library)
  - name
  - type (machine, freeweight, barbell, dumbbell, cable, bodyweight, etc.)
  - equipment (specific machine name or "Olympic barbell", "dumbbell", etc.)
  - settings_description (text e.g., "Seat height: 4, backrest: 105")
  - media (list of attached images/videos, up to 5)
  - default_sets (template: number of sets, reps, warmup flag)
  - notes

Gym
  - name
  - location (latitude, longitude optional)
  - address (optional)

WorkoutLog (historical record after completion)
  - workout_id (or snapshot of workout)
  - started_at, completed_at
  - performance_notes
```

## Key Feature Requirements

### 1. Workout Creation
- **Pre-built Workouts:** User designs workouts ahead of time, selecting exercises from the global ExerciseDefinition library. Exercises can be added as references (linked) to the global definition, or copied (customized per workout). If copied, modifications to that instance do NOT affect the global definition or other workouts.
- **On-the-fly Creation:** When at a new gym, user can quickly create a workout and add exercises immediately, including capturing photos of the machine to attach to a new ExerciseDefinition (or to a custom exercise copy).
- **Exercise Reuse:** User can search their global ExerciseDefinition library and add exercises to any workout, reducing manual entry.
- **Workout Copying:** User can copy an entire workout from one gym to another. The copy creates new ExerciseDefinition copies if customization is needed for different machines.

### 2. Exercise Definitions & Media
- **Global Library:** All ExerciseDefinitions are shared across workouts and gyms. They are the single source of truth for exercise settings and media.
- **Media Attachments:** For each ExerciseDefinition, users can attach up to 5 images/videos (stored locally within the app's data). Purpose: quick visual reference for machine setup (seat height, handle positions, etc.). Embedded to ensure self-contained exports.
- **Copy-for-Customization:** When adding an ExerciseDefinition to a workout, if user wants to modify it (e.g., adjust weight or notes), they can "duplicate" it. The duplicate becomes a custom copy stored within that workout only. The global definition remains unchanged and other workouts linked to it continue using the original.

### 3. Workout Execution Flow (Gym UX)
The execution screen should be glanceable, simple, and fluid:

- **Current Exercise View:** Shows exercise name, equipment, settings description, and attached media (swipeable gallery). Also shows the planned sets in a list.
- **Set Logging:** For each set, user sees target weight and reps. When they start the set, they can tap to begin timing that set. After completing, they tap to stop the set timer and then input actual weight and reps (or keep target if matched). UI should allow quick entry (big buttons, maybe increment/decrement).
- **Rest Timer:**
   - Separate from set timer. After completing a set, user can tap "Start Rest" to begin an upward-counting timer (elapsed seconds).
   - Timer displays current elapsed rest time prominently.
   - Optional subtle hint of suggested optimal rest duration (e.g., a small text: "60-90 sec" in a muted color). Not enforced.
   - When ready, user taps "End Rest" (or "Next Set") to stop the rest timer and start the next set.
- **Progressive Overload Cues:**
   - At start of a set, if the planned weight is higher than any previously logged weight for that exercise (or higher than last workout's max), the app can display an encouraging message: "New personal weight target! 💪".
   - After logging a set where actual weight > previous max OR actual reps >= previous max reps, show celebratory feedback: "New PR! 🎉" and maybe animate.
   - These incentives should be friendly and optional (can be disabled in settings).
- **Navigation:** Simple "Previous" and "Next" buttons to move between exercises and sets. Auto-advance when a set is completed could be an option.
- **Quick Editing:** The prompt says "Not so important since it is more about setting it than logging it." So editing logged data should be possible but not the primary UX. A simple edit icon per set that opens a small modal is sufficient.

### 4. Gym Management
- **Gym Profiles:** User can create and manage a list of frequent gyms, giving each a name and optional geolocation (GPS coordinates) and address.
- **Workout-Gym Association:** Each workout is tagged to a specific gym (select from list). This helps with organization and potential future location-based features.
- **Copy Workout Across Gyms:** When viewing a workout, user can choose "Copy to another gym". This creates a duplicate workout linked to the target gym, and each exercise in the copy is also duplicated (custom copies) so they can adjust machine settings to match the equipment at the new gym.

### 5. Data Export / Import
- **Full Backup:** The app supports exporting the entire local database (all workouts, exercises, gyms, logs, and embedded media) into a single ZIP file.
- **Restore:** Importing a ZIP fully replaces the current local data with the imported state (or merges? Probably replace for simplicity, like device migration).
- **Use Cases:** Phone change; sharing entire library with another user; backup.
- **Implementation:** SQLite database file plus media folder packaged into ZIP; on import, unzip and replace database and media directory, with appropriate migrations if schema changed.

### 6. Styling & UX (Light Mode Glassmorphism)
- **Theme:** Light mode only (per user preference). Glassmorphism aesthetic with translucent panels, subtle blur, and smooth animations.
- **Primary Colors:** Soft palette; suggested: light backgrounds with glass panels tinted white/light gray, subtle shadows, rounded corners (20-28px). Accent color for CTAs could be a gentle gradient (e.g., sky blue to purple).
- **Typography:** Clean, modern fonts (e.g., Inter or SF Pro). Good contrast for outdoor gym visibility, but since light mode, ensure sufficient darkness for text.
- **Animations:** Fluid transitions between screens, set logging, buttons that lift slightly on press, fade-ins for media. Avoid overly flashy; keep professional and smooth.
- **Mobile-First:** All UI elements sized for thumb interaction. Bottom navigation bar (or top, but consistent). Important actions within easy reach.

### 7. Technical Stack & Architecture
- **Framework:** Flutter 3.x
- **Platform:** PWA (progressive web app) – responsive mobile layout, service worker for offline support, manifest for installability. No native app stores initially.
- **Database:** SQLite via `sqflite_common_ffi` for web/desktop or `sqflite` for mobile; but since PWA runs in browser, use `sqflite_common_ffi` with `flutter_web_plugins' to use IndexedDB? Actually for Flutter web, SQLite can be implemented via `sql.js' (Emscripten) or use wrapper like `sqflite_web`. Choose a solution that works offline and persists data.
- **State Management:** Riverpod or Bloc – pick one consistently.
- **Media Storage:** Save captured photos/videos as files in app's local storage (in browser: IndexedDB or localStorage with file API). Store relative paths in SQLite.
- **Export/Import:** Use `archive` package to create ZIP; include DB file (exported as binary) and media directory. For web, use `dart:html` File API to trigger download; for import, use file picker.
- **Code Structure:** Layered architecture: data (repositories, models), domain (use cases), presentation (screens, widgets). Keep UI and logic separate.
- **Testing:** Unit tests for database operations, use cases; widget tests for key screens; integration test for full workout flow.
- **Performance:** Lazy load media; keep DB size reasonable (compress images? optional). Use pagination if needed for long workout lists.

### 8. MVP Scope & Priorities
**Phase 1 (MVP):**
- Basic workout creation (add exercises from global library, define sets)
- Workout execution with set logging and simple rest timer (upward counting, start/stop)
- ExerciseDefinition global library with media attachments (camera capture from device)
- Gym profiles and assignment
- Full export/import (ZIP) of all data
- Light mode glassmorphism UI; smooth animations
- Local SQLite persistence
- Progressive overload cues: display encouraging messages when target weight is higher than previous max, celebrate new PR after logging.

**Phase 2 (Future, out of scope for initial prompt but noted for planning):**
- Cloud sync across devices
- Advanced statistics charts (progress over time, volume, PR history)
- Social features (Gym Buddy concept)
- Trading/investment modules
- Advanced rest timer features (sound notifications, customizable suggestions)
- Offline-first enhancements with background sync

## Deliverables from Agent

1. **Full Flutter PWA project** with proper folder structure and separation of concerns.
2. **SQLite schema** and repository classes with CRUD operations for all entities.
3. **Screens:**
   - Home/Dashboard (list of recent workouts, quick-start, create new)
   - Workout Editor (create/edit workout, add exercises, reorder)
   - Exercise Library (browse, create, edit ExerciseDefinitions with media capture)
   - Workout Execution screen (as described)
   - Gym Management screen
   - Settings (rest timer preferences, progressive overload toggles)
   - Export/Import screen
4. **State management** wiring (Riverpod providers or Bloc).
5. **Media handling** – capture from camera roll or camera, store locally, display.
6. **Export/Import** mechanism that packages DB and media.
7. **Glassmorphism theme** – define colors, glass card widgets, animation curves, and apply consistently.
8. **Documentation:** README with setup instructions, architecture diagram, and notes on running the PWA locally and building for production.
9. **Testing:** At least one unit test sample and one integration test for workout flow to demonstrate approach.

## Non-Goals (Explicitly Out of Scope)

- Cloud backend or sync (MVP is local-only)
- Native iOS/Android apps (PWA only for now)
- Advanced trading/crypto integration
- Social features or Web3 components
- Dark mode (light mode only per user preference)
- Automatic calendar integration
- Email processing

## Notes for Agent

- The app must feel **fluid and premium**. Animations should be smooth (use Curves.easeInOut, durations ~300ms). Buttons should have tactile feedback.
- **Performance is critical**: loading media from local storage should be fast; use caching.
- **Data integrity**: Ensure export/import correctly handles all data including media. Test round-trip.
- **Progressive overload cues** should be encouraging but not intrusive. Use subtle icons and friendly copy.
- **Rest timer** is intentionally simple: two buttons (Start Rest, End Rest) with elapsed counter.
- The **global ExerciseDefinition library** is key for reuse. Implement search, categories (muscle groups?) optional but nice.
- **Copy-on-write** semantics for exercises in workouts: if a user wants to edit an exercise within a workout, they must first duplicate it; otherwise changes affect the global definition and all workouts linked to it. Provide UI affordance: "Edit this exercise" vs "Edit global definition". Maybe a toggle: "Apply changes to all workouts using this exercise?" – but per requirement, default is linked; user must dupe to customize. Consider UI: long-press or edit button with options: "Edit this instance", "Edit global".
- **Video support**: For media, allow both images and short videos (maybe 15 sec max). Keep it simple: display as thumbnail, tap to play full-screen.
- **ZIP format**: Include a manifest.json with version, schema version, to allow future migrations. During import, detect version and run migrations if needed; else error gracefully.

## Success Criteria

- User can create a workout with 5 exercises, each with 4 sets, attach a photo to one exercise, and complete the workout logging sets without errors.
- Rest timer increments correctly and can be started/stopped independently from set timers.
- Progressively, if user increases weight beyond previous max, they see celebratory feedback.
- User can export data, delete app data (or simulate), import ZIP, and see identical workouts, exercises, gyms, and media restored.
- The UI looks polished with glassmorphism: translucent panels, soft shadows, smooth transitions, and is fully usable on a mobile screen.
- Codebase is clean, well-organized, and includes basic tests.

## References

- USER.md: Master Phil's profile, interests, pain points.
- HEARTBEAT.md: Prior automated ideation context (not directly relevant).
- MEMORY.md: Recent decisions (GitHub standards, healthcheck, etc.) – apply consistent GitHub repo standards if publishing.
- AGENTS.md: Workspace operating procedures.

---

**Prompt for AI Agent:** Using this specification, produce a production-quality Flutter PWA application following the architecture and design guidelines. Include comprehensive documentation and tests. Assume the agent has access to standard Flutter/Dart packages and can request additional packages if needed, but keep dependencies minimal.
