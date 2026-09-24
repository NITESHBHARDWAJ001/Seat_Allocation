# Exam Room & Seat Allocator

A complete exam-day planning tool for a college: it turns a student list, a room list and a date sheet into **seat-by-seat seating plans**, **printable / Excel room sheets**, and **fair invigilation (duty) rosters**.

The seating engine is a **deterministic constraint solver – no AI, no randomness you cannot reproduce**. The same inputs and the same seed always give the same plan, every hard rule is checked again by an independent validator, and anything the solver cannot satisfy is reported honestly instead of being hidden.

> Status: seating, rules, validation, Excel import/export, printable sheets, duty rosters, duty windows and the **attendance / answer-book memo module** are built. Remaining work is listed in the [Roadmap](#roadmap-planned-features).

---

## Table of contents

1. [What it does](#what-it-does)
2. [Feature list](#feature-list)
3. [Technology stack](#technology-stack)
4. [Architecture](#architecture)
5. [Repository layout](#repository-layout)
6. [Core concepts and data model](#core-concepts-and-data-model)
7. [How seat allocation works](#how-seat-allocation-works)
8. [Seating rules reference](#seating-rules-reference)
9. [Validation and honest reporting](#validation-and-honest-reporting)
10. [Duty roster and Duty Windows](#duty-roster-and-duty-windows)
11. [Import and export](#import-and-export)
12. [Storage and Google Sheets sync](#storage-and-google-sheets-sync)
13. [Backend API](#backend-api)
14. [Getting started](#getting-started)
15. [Configuration](#configuration)
16. [Deployment](#deployment)
17. [Testing](#testing)
18. [Sample and real-data fixtures](#sample-and-real-data-fixtures)
19. [Design decisions](#design-decisions)
20. [Known limitations](#known-limitations)
21. [Roadmap (planned features)](#roadmap-planned-features)

---

## What it does

Typical workflow for an exam session or a whole sessional:

1. **Load data** – students, rooms (with their seat grids), teachers, and the date sheet (typed, pasted, or imported from Excel).
2. **Create exams** – one exam = one sitting (date + time + the students who write in it + the rooms it may use). Importing a date sheet creates all exams at once, grouping papers that share a date and time.
3. **Choose rules** – how branches / years may mix, whether roll numbers must stay consecutive, which rooms are preferred, how few rooms to use.
4. **Generate the allocation** – the solver places every student on a seat, then a validator re-checks everything.
5. **Review and adjust** – seating map, conflict list, per-room subject labels, manual moves with a live "what would this break" preview.
6. **Print / export** – printable room sheets and Excel per room.
7. **Assign invigilators** – per exam, or fairly across a whole date range with Duty Windows. The Duty Chart shows every teacher across every session.

---

## Feature list

### Data management
- Students (roll number, name, branch, year, section, semester, batch) with search and multi-select filters (multiple branches / years / sections at once).
- Rooms as regular grids or irregular layouts, with a visual layout editor: block individual seats, per-room priority, enable / disable a room.
- Teachers (name, branch, email, phone).
- Date sheet with subjects per branch + year (no section), optional subject codes.
- Bulk paste import (CSV-like text) for students, rooms and teachers.
- **Excel (.xlsx) import** for Students, Teachers and Date sheet, with a downloadable template workbook (headers, example rows, instructions) and row-level error reporting. Impossible dates (e.g. 31-02-2026) and bad times are rejected with the row number.

### Seat allocation
- Deterministic, seeded constraint solver (scoring + backtracking) with an optimizer pass.
- **Hard rules** (never broken) and **soft rules** (preferred, scored).
- **Adjacency separation** by branch, year, section or batch – horizontal, vertical, diagonal, each strict or preferred.
- **Mix groups** – choose exactly how to mix: branch-wise, year-wise or both ("one row of that branch or year").
- **Strict roll-number continuity** with correct semantics for year groups (each year is its own continuity group), vertical-only (rows), horizontal-only (columns) and both (checkerboard).
- **Room priority** – rooms are filled in priority order.
- **Minimum rooms** mode – uses the fewest rooms that actually seat everyone, growing one room at a time when strict rules eat into capacity.
- Per-room branch requirements and branch distribution (strict / preferred / auto).
- Room capacity, blocked seats and disabled rooms respected.
- **Always-on sitting-conflict check** – warns when a student is scheduled in two exams whose times overlap.
- Feasibility analysis and rule-contradiction detection *before* solving, with a plain explanation when the request is impossible.
- Reproducible: seed stored with every result; regenerate creates a new version, old versions are kept.
- Incremental manual override with preview (moves one student, re-validates, reports what it would break).

### Reports and printing
- Seating map per room with roll-number search.
- **Subject labels after allocation** – detects the separation direction and labels each row (vertical), column (horizontal) or seat (checkerboard) with its subject and subject code, plus a **legend at the bottom** of the printable sheet.
- **Printable room sheets** (browser print → PDF) with invigilator names and subjects filled in.
- **Excel export per room** next to each Print button.
- Validation report: hard-constraint checklist, soft scores, conflict list with suggested fixes.

### Duty (invigilation)
- Per-exam duty roster with **students per invigilator** sizing based on students actually seated (not seat capacity).
- **Only occupied rooms get duty** – an empty room is never assigned an invigilator.
- Round-robin fair assignment, no teacher double-booked in overlapping sessions, optional avoidance of a teacher's own branch, max duties per day / in total.
- **Duty Windows** – define a date range (e.g. "Sessional 1: 28 Sep → 1 Oct"), per-teacher min / max / exempt, default limits and a per-day cap; the planner spreads duties fairly across **every session in the window**, including multiple sessions per day.
- Live "what this window needs" preview: sessions, slots needed, teachers available, fair share, capacity warnings, skipped exams.
- Honest result: slots filled vs needed, busiest − quietest spread, below-minimum teachers, warnings.
- Hand-edited rosters are **locked** and counted, not overwritten.
- **Duty Chart** – teacher × session matrix with totals, quota text, spread indicator and a "slots filled" footer; updates automatically whenever duties change.

### Attendance, absentees and answer-book memos
- **Attendance** menu: every sitting with its progress (absent / unfair means / stray counts, finalized or not).
- **Marking screen** – everybody is present by default; only exceptions are stored. Room tabs show each room's roll numbers grouped by branch. **One tap** marks absent (tap again to undo). A mode switch makes taps mean *unfair means* (UMC) with a reason (Copying, Mobile phone, Impersonation, ...). One box accepts typed / pasted roll numbers (comma, space or line separated). A roll number that is not on the exam list can be added as a **stray case** with its branch.
- Live side panel: absent by room, unfair-means list, stray list. **Finalize** freezes a sitting once the memo is handed over.
- **Attendance sheets** – one page per room in seat order (roll no., name, branch, subject with code, signature column, invigilators from the duty roster). Blank for use before the exam, or with marked status after. Print and Excel.
- **Forwarding memo for secrecy answer-book** – one memo per **branch + paper (subject code) + semester** in a sitting, laid out like the university form: per-room roll-number ranges with sub-totals, (A) answer books, (B) candidates, (C) absentees, (D) unfair-means cases, (E) stray cases, (F) grand total `P + A`, centre and superintendent block, three copies. Print and Excel.
  - Ranges are runs of **consecutive** roll numbers; a run ends wherever the next roll number is absent, missing from the list or belongs to another branch, and the next present roll starts a new run (`2025293206 – 2025293224, 2025293226`).
- **Reports** – all branches → one branch (every paper across all sittings) → one paper, showing present roll numbers, then absent, unfair means and stray below, with the same tap-to-mark controls.
- **Settings → Institution** – university, college, centre no. and superintendent printed on memos and sheets.
- Attendance is stored per exam, keyed by roll number, so marks survive a regenerated seating plan; it is part of the Sync entity list.

### Platform
- Frontend and backend are **independently deployable**.
- Settings page with manual **push / pull sync** to Google Sheets through the backend.
- In-app **Help** page describing the workflow.

---

## Technology stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 everywhere (strict) |
| Monorepo | npm workspaces (`packages/*`, `apps/*`) |
| Frontend | React 18, react-router-dom 6, Vite 5, Tailwind CSS 3, PostCSS / Autoprefixer |
| Frontend storage | IndexedDB via `idb` (local-first, no server needed) |
| Off-main-thread solving | Web Worker (`allocation.worker.ts`) |
| Excel | `read-excel-file` (import), `write-excel-file` (export and templates) |
| Backend | Node 22, Express 4, `cors`, `dotenv`, run with `tsx` |
| Backend storage | JSON files on disk **or** Google Sheets (`googleapis`, service account) |
| Engine | Pure TypeScript package `@exam-allocator/allocation-engine`, no runtime dependencies |
| Domain / contracts | Pure TypeScript package `@exam-allocator/core` (models, repository interfaces, utils) |
| Tests | Vitest (engine unit + scenario + stress tests) |
| Scripts | `tsx` for fixture / template generators |
| Hosting (intended) | Vercel for the frontend (`vercel.json` SPA rewrite), any Node host (e.g. Render) for the backend |

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │ packages/core            (models + interfaces)│
                    │ packages/allocation-engine   (pure solver)    │
                    └───────────────┬──────────────────┬───────────┘
              sync:frontend-vendor  │                  │  sync:backend-vendor
                    ┌───────────────▼───────┐  ┌───────▼───────────────────┐
                    │ apps/frontend          │  │ apps/backend               │
                    │ React + Vite           │  │ Express API                │
                    │ IndexedDB repositories │  │ JSON or Google Sheets repos│
                    │ Web Worker runs solver │  │ same solver, server side   │
                    └───────────────┬───────┘  └───────▲───────────────────┘
                                    │  manual push / pull (Settings)        │
                                    └───────────────────────────────────────┘
```

Key ideas:

- **One brain, two bodies.** All scheduling logic lives in `packages/core` and `packages/allocation-engine`. Both apps use it unchanged.
- **Vendoring for independent deploys.** So each app can be deployed on its own (no monorepo access at build time), the two packages are **copied** into `apps/*/src/vendor/` by `npm run sync:frontend-vendor` and `npm run sync:backend-vendor`. **Edit the canonical code in `packages/`, then re-sync.** The repository implementations (IndexedDB, in-memory/JSON, Google Sheets) live directly in each app's `vendor/` folder and are edited in place.
- **Repository pattern.** Every entity is accessed through interfaces defined in `core` (`StudentRepository`, `RoomRepository`, `ExamRepository`, `AllocationRepository`, `TeacherRepository`, `DutyRosterRepository`, plus a settings store). Storage can be swapped without touching any page or the engine.
- **Local-first frontend.** The frontend works entirely in the browser (IndexedDB) and makes no network calls unless the user turns on sync.
- **Worker isolation.** Solving runs in a Web Worker, so large sessions never freeze the UI. (After changing the engine, restart Vite and clear IndexedDB / worker caches when verifying.)

---

## Repository layout

```
apps/
  frontend/               React app (Vite, Tailwind)
    src/pages/            Dashboard, Students, Rooms, RoomLayout, Teachers, Exams,
                          ExamCreate, ExamDetail, DutyChart, DutyWindows,
                          Attendance, AttendanceExam, AttendanceSheets, AttendanceMemos,
                          AttendanceReports, Help, Settings
    src/features/         allocation (map, validation, reports), duty (roster panel),
                          exam (datesheet import, subject editor)
    src/components/       shared UI (RuleConfigEditor, SeatGridView, MultiSelectFilter, ...)
    src/services/         repositories, app data context, excel import, export/print,
                          mix groups, duty windows, backend sync client
    src/workers/          allocation.worker.ts
    src/vendor/           synced copy of core + engine, IndexedDB repositories
  backend/                Express API
    src/routes/           students, rooms, exams, allocations, teachers, duty, sync
    src/vendor/           synced copy of core + engine, JSON / Sheets repositories
    scripts/              inspect-sheet.mjs, clear-sheet.mjs
packages/
  core/                   models, repository interfaces, utils (roll-number compare, ids, ...)
  allocation-engine/
    src/solver/           solver + strict continuity lane planner
    src/constraints/      adjacency + distribution rules
    src/graph/            seat adjacency graph
    src/heuristics/       cohort grouping, mixing
    src/scoring/          soft-rule scoring
    src/optimizer/        improvement pass
    src/validator/        independent hard/soft validation
    src/diagnostics/      feasibility + conflict analysis
    src/rooms/            minimal-room selection
    src/scheduling/       exam-time overlap detection
    src/subjects/         subject resolution + row/column/seat subject labels
    src/duty/             duty allocator, validator, incremental edit, window planner
    src/attendance/       roll-range compression, secrecy memo builder
    src/__tests__/        102 tests
fixtures/                 CSV / Excel sample data, stress data, real-college data
scripts/                  fixture generators, Excel template builders, vendor sync
```

---

## Core concepts and data model

| Entity | Purpose |
|---|---|
| `Student` | id, rollNumber, name, branch, year, section, semester, batch, active |
| `Room` | id, name, building, priority, enabled, rows, seats (row, col, available, blocked + reason), optional per-room branch requirements |
| `Teacher` | id, name, branch, email, phone, active |
| `Exam` | one sitting: date, start / end time, studentIds, roomIds, `ruleConfig`, `subjectAssignments`, allocation ids (+ active one), duty roster ids (+ active one) |
| `RuleConfig` | adjacency rules, distribution, roll / branch continuity, utilization strategy, year / branch mixing, allocation mode, priority weights |
| `AllocationResult` | versioned result: seed, assignments (student → seat → room), unallocated students, snapshots of students / rooms / config, validation report, score, status (`success` / `partial` / `failed`), feasibility, manual overrides |
| `SubjectAssignment` | branch + year → subject name (+ code) |
| `DutyRoster` | per exam: teacher → room assignments, per-room duty targets, unassigned teachers, validation, manual overrides, `windowId`, `basedOnAllocationId`, `basis` |
| `ExamAttendance` | per exam: exceptions only, keyed by normalized roll number (`absent` / `umc` / `stray`, reason, note, stray branch and name), `finalized` flag |
| `InstitutionProfile` | university, college, centre no., superintendent (Settings) |
| `DutyWindow` | date range + students per invigilator + default / per-teacher min, max, exempt + per-day cap + own-branch avoidance |

---

## How seat allocation works

1. **Filter** – active students, enabled rooms.
2. **Feasibility check** – capacity, per-room branch requirements, contradictory rules. Blocking problems short-circuit with an explanation instead of a bad plan.
3. **Room selection** – in *minimum-rooms* mode, start with the fewest priority-ordered rooms that cover everyone by raw seat count, and add one room at a time while anyone remains unseated (strict adjacency lowers effective capacity).
4. **Solve** – build a seat graph per room (horizontal / vertical / diagonal neighbours), then place students by scoring candidate seats and backtracking; hard rules can never be violated to place someone.
5. **Strict continuity lanes** (when roll continuity is *strict*): a deterministic planner lays out the plan up front instead of nudging a scorer.
   - Continuity groups are `branch + year`, each sorted by roll number (natural / numeric-aware order, so `8725199A` and `87265501` sort correctly).
   - **No separation rule:** each cohort fills rooms in reading order.
   - **Vertical-only:** rows are lanes (rolls run left-to-right along a row).
   - **Horizontal-only:** columns are lanes (rolls run top-to-bottom).
   - **Horizontal + vertical:** checkerboard parity. With two or more separated values, **two parity lanes** are used and values are balanced across them, so every room can be filled completely while same-value students are never adjacent.
   - Anything the lane plan cannot place falls back to the general solver – nobody is left unseated just to protect continuity.
6. **Optimize** – improvement pass over soft scores.
7. **Validate** – an independent validator re-derives every hard rule from the final assignments.
8. **Store** – result with seed, snapshots and status; regenerating never destroys earlier versions.

Performance: about 700 students / 14 rooms solve in tens of milliseconds; the ~1000 student / 20 room stress test runs in about a second.

---

## Seating rules reference

- **Adjacency rules** – attribute (`branch` / `year` / `section` / `batch`), directions (horizontal, vertical, diagonal), mode (`strict` = hard, `preferred` = soft, `off`), priority.
- **Roll continuity** – `off` / `preferred` / `strict`.
  - *Strict meaning:* within a branch + year cohort, each room holds **one unbroken roll range**. When a cohort is larger than a room (or shares rooms with others) the boundary between two rooms is unavoidable and accepted; leaving a room and returning to it is a failure.
- **Branch continuity** – keeps a branch together where possible.
- **Year mixing** – `mixed` / `year-wise` / `custom`; **branch mixing** – `mixed` / `partial` / `branch-specific` / `custom`.
- **Allocation mode** – `auto`, `balanced`, `minimum-rooms`, `maximum-separation`, `strict-custom`.
- **Utilization strategy** – `compact`, `spread`, `balanced`, `custom`.
- **Room requirements / distribution** – force or prefer specific branches (with optional counts) in specific rooms.
- **Priority weights** – safety, one seat per student, adjacency, explicit distribution, roll continuity, branch balancing.

Imported date sheets default to **minimum-rooms** with **strict roll continuity** and strict branch adjacency (horizontal + vertical).

---

## Validation and honest reporting

**Hard checks** (each pass / fail): one seat per student; one student per seat; only available seats in selected, enabled rooms; room capacity; every selected student seated; strict distribution; strict room-branch requirement; strict adjacency; strict roll continuity.

**Soft scores:** preferred adjacency, roll-number continuity %, branch distribution balance, room utilization vs strategy.

**Conflicts** carry a type, severity, the seats / students involved and a suggested resolution. The allocation `status` is `success` only when everyone is seated and every hard check passes; otherwise it is `partial` or `failed` and says why.

Known combination limit: two *simultaneous* strict adjacency rules on different attributes (for example strict branch **and** strict year, both horizontal + vertical) are not guaranteed by the lane planner. The validator flags such a plan rather than hiding it.

---

## Duty roster and Duty Windows

### Per-exam roster (exam page)
- Invigilators per room = `max(1, ceil(students seated ÷ students per invigilator))`; rooms with 0 students get none.
- Requires a seat allocation first; warns if the seating was regenerated after the roster (stale) or the roster is a legacy capacity-sized one.
- Excludes teachers already on duty in an overlapping exam, respects max per day / total, can avoid a teacher's own branch.
- Manual reassignment with conflict checking.

### Duty Windows (fairness across a date range)
The planner processes the window's sessions in date / time order:

1. Hard limits remove a teacher from a slot: exempt, at personal max, at per-day cap, already on duty in an overlapping session, (optionally) own-branch.
2. Among eligible teachers, the **least-loaded goes first**, seeded shuffle for ties.
3. A balancing pass moves duties from the busiest to the quietest teacher when the difference is 2 or more and all rules allow.
4. Shortfalls, below-minimum teachers and skipped exams (no seating yet) are reported.

Tested guarantees: spread of at most 1 duty on awkward numbers and multiple seeds; no overlapping-session double booking; per-day and per-teacher limits respected; reproducible per seed. Compared with per-exam random generation (spread 2–5 on the same data) the planner gives spread 1.

Verified on the real data set: 9 sessions, 140 slots, 45 teachers, 3-per-day cap → 140/140 filled, everyone has 3 or 4 duties, Duty Chart updated without reload.

Note: with *own-branch avoidance* on, rooms that mix every branch may have no eligible teacher; the planner then reports a shortfall instead of breaking the rule.

---

## Import and export

| Item | Import | Export |
|---|---|---|
| Students | Excel, bulk paste | CSV |
| Rooms | Bulk paste (`name, rows, seatsPerRow[, priority, building]`), layout editor | – |
| Teachers | Excel, bulk paste | – |
| Date sheet | Excel, paste | – |
| Room seating | – | Print → PDF, **Excel per room** |

Excel headers (order does not matter, aliases accepted): Students `Roll Number*, Name*, Branch*, Year*, Section*, Semester, Batch`; Teachers `Name*, Branch*, Email, Phone`; Date sheet `Date*, Start Time*, End Time*, Branch*, Year*, Subject Name*, Subject Code`. Download the template from any import panel.

---

## Storage and Google Sheets sync

- **Default:** everything lives in the browser's IndexedDB. Nothing leaves the machine.
- **Backend storage:** `DATA_BACKEND=json` (files on disk) or `DATA_BACKEND=sheets` (a Google Sheet, one tab per entity, via a service account).
- **Settings → Sync:** toggle, backend URL, *Test connection*, **Push local → spreadsheet**, **Pull spreadsheet → local**.
  - Manual by design (avoids Sheets API quota problems on bulk edits and silent failures).
  - Upsert by id in both directions; **deletions do not propagate** (documented limitation).
  - This is how a second browser gets the same data: push from one, pull in the other.
- Duty Windows and mix-group choices are stored in the settings store and are not yet part of the sync entity list.

---

## Backend API

Base path `/api`. Friendly CRUD routes mint new ids; the sync routes accept caller-supplied ids.

| Route | Purpose |
|---|---|
| `/api/students`, `/api/rooms`, `/api/teachers`, `/api/exams` | CRUD |
| `/api/allocations` | list / get / generate (runs the same engine server side) |
| `/api/duty` | `POST /generate`, `GET /:id` |
| `/api/sync/:entity` | `GET` all items of `students | rooms | exams | allocations | teachers | dutyRosters` |
| `/api/sync/:entity/bulk` | `POST { items }` upsert by id |
| `/api/health` | health check |

The backend `duty` route still sizes by seat capacity, unlike the frontend which now uses students seated (see limitations).

---

## Getting started

Requirements: Node 20+ (22 recommended), npm.

```bash
npm install
npm run dev:frontend        # http://localhost:5173  (works alone, IndexedDB)
npm run dev:backend         # http://localhost:4000  (optional)
```

After editing anything in `packages/core` or `packages/allocation-engine`:

```bash
npm run sync:frontend-vendor
npm run sync:backend-vendor
npm run build               # typechecks both apps and builds the frontend
```

First run in the app: **Students → Import from Excel**, **Rooms → Bulk Import**, **Exams → Import Datesheet**, open an exam → **Generate Allocation**. The Help page walks through the same flow.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run test` | engine test suite (Vitest) |
| `npm run seed` | regenerate CSV fixtures |
| `npm run seed:excel` | regenerate Excel templates and test files |
| `npx tsx scripts/build-real-data.mts` | convert the real college files into import-ready Excel |
| `npx tsx scripts/test-real-data.mts A` | run every real-data session through the engine (mode `A` default rules, `B` adds strict year adjacency, `C` horizontal-only branch) |
| `node apps/backend/scripts/inspect-sheet.mjs` | read back what is stored in the Google Sheet |

---

## Configuration

Backend (`apps/backend/.env`, see `.env.example`):

| Variable | Meaning |
|---|---|
| `PORT` | API port (default 4000) |
| `CORS_ORIGIN` | comma-separated allowed origins; unset allows any (dev only) |
| `DATA_BACKEND` | `json` (default) or `sheets` |
| `DATA_DIR` | folder for JSON files (needs a persistent disk on real hosts) |
| `GOOGLE_SHEETS_ID` | spreadsheet id (between `/d/` and `/edit`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | service account; share the sheet with it as Editor |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | its private key, quoted, with `\n` sequences. **Never commit; rotate if exposed.** |

Frontend: no required configuration (it is local-first). The sync backend URL is entered in the Settings page.

---

## Deployment

- **Frontend → Vercel** (or any static host): root `apps/frontend`, build `npm run build`, output `dist`. `vercel.json` already rewrites all routes to `index.html` for the SPA.
- **Backend → Render / Railway / Fly / a VPS:** root `apps/backend`, start `npm start`. Set the env vars above. Free serverless tiers have ephemeral disks, so use `DATA_BACKEND=sheets`, a mounted volume, or a real database.
- Because the shared packages are vendored, each app builds from its own folder without the rest of the monorepo.

---

## Testing

`npm run test` runs **102 tests** in `packages/allocation-engine`:

- adjacency, seat graph, capacity and blocked seats
- distribution and per-room branch requirements
- feasibility and rule contradictions
- roll continuity (order, meaning of strict, vs. adjacency, re-entered-room failure)
- year mixing, including the 120-student CSE Year 3 + Year 4 fixture
- minimum rooms and room priority
- subject resolution and row / column / seat subject labels
- duty allocation and duty windows (fair spread across seeds, overlaps, per-day cap, limits, shortfalls, locked rosters)
- attendance: roll-range compression (breaks at absent / missing rolls, letter suffixes) and memo totals (P + A, umc, strays, unseated)
- `realCollegeMix` – 706 students, 6 branches × 2 years, 14 rooms, strict continuity, minimum rooms
- stress – about 1000 students / 20 rooms, time budget and reproducibility

Beyond unit tests, the app was exercised end to end in a real browser: import the real Excel files, generate all 9 seatings (all seated, all hard checks green), create a duty window and confirm the Duty Chart updates.

---

## Sample and real-data fixtures

| Folder / file | Contents |
|---|---|
| `fixtures/*.csv` | small sample students, rooms, teachers, date sheets |
| `fixtures/stress-1000-students/` | 1000-student stress data |
| `fixtures/year-mixing-branch-120-students/` | CSE Year 3 + 4 continuity regression |
| `fixtures/continuous-150-students/`, `year-prefix-150-students/` | continuity and roll-prefix scenarios |
| `fixtures/import-templates.xlsx` | header / format template for all three imports |
| `fixtures/test-import-valid.xlsx`, `test-import-errors.xlsx` | should import cleanly / should import nothing and list every problem |
| `fixtures/real-data/` | the college's real 3rd + 7th semester lists (706 students), 14 rooms and the sessional date sheet (9 sessions, 28 Sep – 1 Oct) in import format |

Date-sheet mapping used for the real data: Sem III → Year 2, Sem VII → Year 4; `CE` → CSE, `EE` → ELEC., `AIML` → AI&ML.

---

## Design decisions

- **Deterministic, not AI.** Every plan is explainable, reproducible from its seed and re-checked by an independent validator.
- **Honest failure.** Unseatable students and broken strict rules are reported with reasons; the solver never silently violates a hard rule and never pretends success.
- **Seating and duty are decoupled.** Duty planning reads seating results but cannot change them.
- **Manual sync, not per-write mirroring** – predictable and quota-safe.
- **Additive, upsert-only sync** – never deletes remotely or locally.
- **Versioned results** – regenerating keeps history.
- **Locked hand edits** – manual duty changes survive re-planning.

---

## Known limitations

- Two simultaneous strict adjacency rules on different attributes are not guaranteed (validator flags it).
- Under strict adjacency a room is used at roughly half density per branch; small irregular rooms may stay about half full.
- Sync does not propagate deletions; Duty Windows and mix-group settings are outside the sync entity list.
- The backend `duty` route still sizes by seat capacity.
- Excel import of per-teacher duty quotas is not implemented (quotas are edited in the Duty Windows page).
- The Help page does not yet describe Excel import or Duty Windows.
- Google Sheets is fine for college-scale data but slow for very large allocation payloads.
- PDF is via browser print-to-PDF; there is no one-click PDF download.

---

## Roadmap (planned features)

These are **not implemented yet**; they are the agreed next steps.

### 1–3. Attendance sheets, absentee entry, branch-wise reporting and memos – **built**
See [Attendance, absentees and answer-book memos](#attendance-absentees-and-answer-book-memos). Still to do on this module:
- Excel / paste **import of absentee lists** (currently typed, pasted or tapped).
- A **branch-wise final challan** across a whole sessional (today the memo is per sitting, per paper).
- Room-wise absentee page as its own printable report.
- A fixed, configurable list of unfair-means reasons.

### 4. Fuller Google Sheets integration
Move from manual push / pull to a **properly integrated spreadsheet workflow**:
- attendance already syncs as its own tab; challans and the institution profile still to be added;
- Duty Windows, duty rosters and mix-group settings added to the sync entity list;
- optional automatic, batched sync with quota-safe rate limiting and clear failure reporting;
- deletion handling (tombstones) so deletes propagate safely.

### 5. Smaller planned improvements
- Excel import for per-teacher duty quotas.
- Backend duty route aligned with students-seated sizing.
- One-click PDF download of room sheets and the attendance sheets.
- Help page updated for Excel import and Duty Windows.
- Dual-attribute strict adjacency (for example branch **and** year) in the lane planner.
- Choosing which room to start seating from, as an explicit option.

---

## License

Private project – all rights reserved by the repository owner unless stated otherwise.
