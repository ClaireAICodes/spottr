# Gym Workout App - Requirements & Design

## 1. Understanding Summary
- **What is being built:** A mobile-first, responsive Flutter PWA for creating, executing, and tracking gym workouts with an integrated exercise media library.
- **Why it exists:** To eliminate the friction of manual workout tracking, provide glanceable visual guidance on machine setups, and automatically encourage progressive overload.
- **Who it is for:** Phil (Master Phil), a busy corporate trainer looking for efficiency and robust data tracking without cloud dependencies.
- **Key Constraints:** Local offline persistence using SQLite, embedded media (auto-compressed on capture), cohesive light mode glassmorphism design, and a self-contained ZIP export/import mechanism.
- **Explicit Non-Goals:** Cloud sync or backends, native iOS/Android store deployments, social/Web3 features, and automatic calendar integration.

## 2. Decision Log & Assumptions
*   **Media Handling:** We decided to automatically compress and scale media (e.g. videos to 720p) prior to local storage to ensure the database and ZIP exports remain small, performant, and reliable.
*   **Exercise Library:** There is no "IsGlobal" flag. All generated and customized exercises sit in a single, searchable global library to maximize flexibility and simplify the data model.
*   **Recipe vs. Session Data Model:** We decided to decouple the `Workout` (which acts purely as a reusable recipe/template) from the `WorkoutSession` (which acts as the historical log of an execution).
*   **Progressive Overload Cues:** The progressive overload cue is evaluated on a *pre-set* basis (dynamically comparing the target weight of the upcoming set against the all-time historical max for that specific exercise), rather than a pre-workout basis.

## 3. Database Schema Architecture (Drift / SQLite)
The data layer will be fully normalized to allow for lightning-fast historical queries and PR tracking.

*   **`Gym` Table:** (Id, Name, Latitude, Longitude, Address).
*   **`ExerciseDefinition` Table:** The global, searchable library. (Id, Name, Notes). 
*   **`ExerciseMedia` Table:** (Id, ExerciseId, LocalFilePath, MediaType, SortOrder).
*   **`Workout` (Template) Table:** A reusable recipe. (Id, GymId, Name).
*   **`WorkoutExercise` (Recipe Steps) Table:** Links a Workout to an ExerciseDefinition, defining targets. (Id, WorkoutId, ExerciseId, OrderIndex, TargetSets, TargetReps, TargetWeight).
*   **`WorkoutSession` (Execution) Table:** A chronological record of the user performing a Workout recipe. (Id, WorkoutId, StartTime, EndTime).
*   **`SetLog` (Execution Data) Table:** Logs actual sets during a session. Linked to the Session and the Exercise. (Id, WorkoutSessionId, ExerciseId, SetNumber, ActualWeight, ActualReps, RestTimeTaken).

## 4. UI/UX Design & Workflows
*   **Theme:** Light mode default with a clean Glassmorphism aesthetic (translucent panels, soft shadows, rounded corners ~28px, gentle gradient CTAs).
*   **Execution Flow:**
    1. Select a `Workout` template and begin a `WorkoutSession`.
    2. View the first exercise's media and step targets.
    3. **Pre-set:** Check if Target Weight > Historical Max. If yes, display encouraging cue.
    4. Execute set, tap stop, input Actual Weight/Reps. 
    5. **Post-set:** If Actual > Historical Max, trigger "New PR!" celebration.
    6. **Rest:** Optional upward-counting rest timer displayed. Next set begins on next tap.
*   **Export/Import:** Trigger zip creation (SQLite binary + media folder) leveraging standard platform File APIs. 
