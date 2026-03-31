# Gym Workout App - Comprehensive Development Prompt

## Project Overview

Build a **Flutter-based Progressive Web App (PWA)** for gym workout planning, execution, and tracking. The app targets mobile-first usage (phones at the gym) with a premium light-mode glassmorphism design. It enables users to create detailed workout plans, log sets in real-time, track progressive overload, and maintain an exercise library with machine photos/settings. Data is stored locally in SQLite and can be fully exported/imported via ZIP for backup and device migration.

## User & Context

- **Primary User:** Phil (Master Phil), corporate trainer, weekly gym-goer, interested in efficiency, automation, and data-driven fitness.
- **Pain Points:** Lack of time and mental capacity; wants to eliminate manual workout tracking friction; needs clear, glanceable guidance at the gym; wants progressive overload tracking to be easy and motivating.
- **Technical Preferences:** Mobile-first PWA (app stores later); local storage with optional future cloud sync; embedded media (photos/videos) within the app data; glassmorphism UI with fluid animations; light mode by default with optional dark mode.

## Key Feature Requirements

### 1. Workout Creation
- **Pre-built Workouts:** User can design workouts ahead of time, creating or selecting exercises from the existing global ExerciseDefinition library. Exercises can be added as references (linked) to the global definition, or copied (customized per workout). If copied, it creates a new instance of the exercise and modifications to that instance do NOT affect the original copy.
- **On-the-fly Creation:** When at a new gym, user can quickly create a workout and add exercises immediately, including capturing photos of the machine to attach to a new ExerciseDefinition or modify existing workouts and exercises.
- **Exercise Reuse:** User can search their global ExerciseDefinition library to reuse and add exercises to any workout, reducing manual entry.
- **Workout Copying:** User can create a copy an entire workout and modify its details as needed. This would result in a new workout created. 

### 2. Exercise Definitions & Media
- **Global Library:** All ExerciseDefinitions can be shared across workouts. User can search the existing global library to add exercises to workouts or create new exercises. 
- **Media Attachments:** For each ExerciseDefinition, users can attach up to 5 images/videos (stored locally within the app's data). Purpose: quick visual reference for machine setup (seat height, handle positions, etc.). Embedded to ensure self-contained exports.
- **Copy-for-Customization:** When adding an ExerciseDefinition to a workout, if user wants a custom version (e.g., adjusted weight or notes), they can "duplicate" it. Or otherwise, they can just link an existing exercise and make changes to the global version that syncs across all workouts. 

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
   - At start of a set, prompt user if they would like to increase weight. If the planned weight is higher than any previously logged weight for that exercise (or higher than last workout's max), the app can display an encouraging message such as: "New personal weight target! Lets go! 💪".
   - After logging a set where actual weight > previous max OR actual reps > previous max reps, show celebratory feedback like: "New PR! 🎉" and maybe animate.
   - These incentives should be friendly and optional (can be disabled in settings).
- **Navigation:** Simple "Previous" and "Next" buttons to move between exercises and sets. Auto-advance when a set is completed could be an option.
- **Quick Editing:** Editing logged data should be possible but not a primary UX. A simple edit icon per set that opens a small modal is sufficient.

### 4. Gym Management
- **Gym Profiles:** User can create and manage a list of frequent gyms, giving each a name and optional geolocation (GPS coordinates) and address.
- **Workout-Gym Association:** Each workout is tagged to a specific gym (select from list or create new). This helps with organization and potential future location-based features.
- **Copy Workout Across Gyms:** When viewing a workout, user can choose "Copy". This creates a duplicate workout which they can link to the target gym or even the same gym, and each exercise in the copy is still linked to the global version. They can then edit it as they would any new workout.

### 5. Data Export / Import
- **Full Backup:** The app supports exporting the entire local database (all workouts, exercises, gyms, logs, and embedded media) into a single ZIP file.
- **Restore:** Importing a ZIP fully replaces the current local data with the imported state (or merges? Probably replace for simplicity, like device migration).
- **Use Cases:** Phone change; sharing entire library with another user; backup.
- **Implementation:** SQLite database file plus media folder packaged into ZIP; on import, unzip and replace database and media directory, with appropriate validations and migrations if schema changed.

### 6. Styling & UX (Light Mode Glassmorphism)
- **Theme:** Light mode focused (default). Glassmorphism aesthetic with translucent panels, subtle blur, and smooth animations.
- **Primary Colors:** Soft palette; suggested: light backgrounds with glass panels tinted white/light gray, subtle shadows, rounded corners (20-28px). Accent color for CTAs could be a gentle gradient (e.g., sky blue to purple).
- **Typography:** Clean, modern fonts (e.g., Inter or SF Pro). Good contrast for outdoor gym visibility, but in light mode, ensure sufficient darkness for text.
- **Animations:** Fluid transitions between screens, set logging, buttons that animate slightly on press, fade-ins for media. Avoid overly flashy; keep professional and smooth.
- **Mobile-First:** All UI elements sized for thumb interaction. Bottom navigation bar. Important actions within easy reach.

### 7. Technical Stack & Architecture
- **Framework:** Flutter 
- **Platform:** PWA (progressive web app) – responsive mobile layout, service worker for offline support, manifest for installability. No native app stores initially.
- **Database:** SQLite or equivalent. Choose a solution that works offline and persists data.
- **State Management:** Riverpod or Bloc or equivalent – pick one consistently.
- **Media Storage:** Save captured photos/videos as files in app's local storage (in browser: IndexedDB or localStorage with file API). Store relative paths in SQLite.
- **Export/Import:** Use `archive` package to create ZIP; include DB file (exported as binary) and media directory. For web, use `dart:html` File API to trigger download; for import, use file picker. For mobile, trigger share sheet or intent so that user can share to Google Drive or other cloud storage apps. 
- **Code Structure:** Layered architecture: data (repositories, models), domain (use cases), presentation (screens, widgets). Keep UI and logic separate.
- **Testing:** Unit tests for database operations, use cases; widget tests for key screens; integration test for full workout flow.
- **Performance:** Lazy load media; keep DB size reasonable (compress images? optional). Use lazy load infinite scroll if needed for long workout lists.

### 8. MVP Scope & Priorities
**Phase 1 (MVP):**
- Basic workout creation (create/add exercises from global library, define sets and reps)
- Workout execution with set logging and simple rest timer (upward counting, start/stop)
- ExerciseDefinition global library with media attachments (camera capture from device)
- Gym profiles and assignment
- Full export/import (ZIP) of all data
- Light mode glassmorphism UI; smooth animations
- Local SQLite persistence
- Progressive overload cues: display encouraging messages when target weight is higher than previous max, celebrate new PR after logging.

**Phase 2 (Future, out of scope for initial version but noted for planning):**
- Cloud sync across devices
- Advanced statistics charts (progress over time, volume, PR history)
- Social features (Gym Buddy concept) and gamification
- Advertisements on free version which can be removed on paid app
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
- Social features or Web3 components
- Automatic calendar integration

## Notes for Agent

- The app must feel **fluid and premium**. Animations should be smooth (use Curves.easeInOut, durations ~300ms). Buttons should have tactile feedback.
- **Performance is critical**: loading media from local storage should be fast; use caching.
- **Data integrity**: Ensure export/import correctly handles all data including media. Test round-trip.
- **Progressive overload cues** should be encouraging but not intrusive. Use subtle icons and friendly copy.
- **Rest timer** is intentionally simple: two buttons (Start Rest, End Rest) with elapsed counter.
- The **global ExerciseDefinition library** is key for reuse. Implement search, categories (muscle groups?) optional but nice.
- **Copy-on-write** semantics for exercises in workouts: if a user wants to edit an exercise within a workout, they can first duplicate it; otherwise changes affect the global definition and all workouts linked to it. Provide UI affordance: "Edit this copy" vs "Edit global exercise definition". Maybe a toggle: "Apply changes to all workouts using this exercise?". Consider UI: long-press or edit button with options: "Edit this instance", "Edit globally".
- **Video support**: For media, allow both images and short videos (maybe 15 sec max). Keep it simple: display as thumbnail, tap to play full-screen.
- **ZIP format**: Include a manifest.json with version, schema version, to allow future migrations. During import, detect version and run migrations if needed; else error gracefully.

## Success Criteria

- User can create a workout with 5 exercises, each with 4 sets, attach a photo to one exercise, and complete the workout logging sets without errors.
- Rest timer increments correctly and can be started/stopped independently from set timers.
- Progressively, if user increases weight beyond previous max, they see celebratory feedback.
- User can export data, delete app data (or simulate), import ZIP, and see identical workouts, exercises, gyms, and media restored.
- The UI looks polished with glassmorphism: translucent panels, soft shadows, smooth transitions, and is fully usable on a mobile screen.
- Codebase is clean, well-organized, and includes basic tests.

---

**Prompt for AI Agent:** Using this specification, produce a production-quality Flutter PWA application following the architecture and design guidelines. Include comprehensive documentation and tests. Assume the agent has access to standard Flutter/Dart packages and can request additional packages if needed, but keep dependencies minimal.
