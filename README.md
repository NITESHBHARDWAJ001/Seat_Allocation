# Exam Room & Seat Allocator

A complete exam-day planning tool for a college: it turns a student list, a room list and a date sheet into **seat-by-seat seating plans**, **printable / Excel room sheets**, and **fair invigilation (duty) rosters**.

The seating engine is a **deterministic constraint solver – no AI, no randomness you cannot reproduce**. The same inputs and the same seed always give the same plan, every hard rule is checked again by an independent validator, and anything the solver cannot satisfy is reported honestly instead of being hidden.

> Status: seating, rules, validation, Excel import/export, printable sheets, duty rosters, duty windows, the attendance / answer-book memo module, organizations with logins and roles, and background sync are built. Next: first deployment on Render + Supabase. See [Scope, roadmap and future enhancements](#scope-roadmap-and-future-enhancements).

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
21. [Scope, roadmap and future enhancements](#scope-roadmap-and-future-enhancements)

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

### Works on phones and tablets
The layout is responsive: on a phone the sidebar becomes a slide-in menu behind a top bar, page headers and button rows wrap, pages use tighter padding, buttons and fields are touch-sized (16 px text in inputs so iOS does not zoom), and every table scrolls sideways inside its own box instead of stretching the page. Checked at 375 px wide on every main page (Dashboard, Students, Rooms, Teachers, Exams, Exam detail with the seating map, Duty Chart, Duty Windows, Attendance marking, sheets, memos and reports, Settings) with no sideways page scroll. Printing and the memo layout are unaffected.

### Organizations, users and sync (optional server mode)
The app runs fully on its own in one browser. Connected to the backend (`DATA_BACKEND=postgres`, Supabase Postgres) it becomes a multi-organization system:
- **Who is who** (one sign-in screen for everybody; the account's role decides where it lands):

  | Account | Belongs to | Sees | Lands on |
  |---|---|---|---|
  | **Platform admin** (the owner of the installation; created once from `SUPER_ADMIN_LOGIN` / `SUPER_ADMIN_PASSWORD`) | no organization | registered organizations and usage counts only - never an organization's students, exams, seating or attendance | `/platform` |
  | **Organization admin** (the person who registered the organization, or the admin the platform admin created for it) | one organization | everything in that organization, plus its users | the app, with a *Users* menu |
  | **Exam cell / Attendance marker / Viewer** (created by the org admin) | one organization | what the role allows | the app, limited menu |

  The platform admin and an organization admin are **different accounts**: the platform admin deliberately cannot open any organization's data, so a person who runs a college as well as the platform needs two logins.
- **Registering an organization is open and instant (no approval step).** Anyone can register from the public page (the landing page's *Register your organization* button; the short code is suggested from the name, and the new admin is signed straight into the app): they enter the organization's name, a short code and their own name, login (email or username) and password; the organization is active immediately and they become its first admin, signed in at once. The endpoint is rate limited (10 per hour per connection by default) and can be closed with `PUBLIC_REGISTRATION=off`, after which only the platform admin can create organizations. The platform admin still sees every registration in the dashboard and can suspend an organization at any time.
- **The server address comes from the environment, never from the user.** The frontend reads `VITE_API_BASE_URL` (`apps/frontend/.env` locally, an environment variable on the frontend host). There is no server-address field anywhere in the app. With `npm run dev` and no value set it falls back to `http://localhost:4000`; a production build with no value shows a clear "server address is not configured" message on the sign-in screen.
- **Platform admin dashboard** (`/platform` after signing in as the platform admin): create organizations for someone else (with a temporary first-admin password), see self-registered ones, suspend / reactivate, reset an org admin's password, activity log. It shows registered details and usage counts (users, students, exams, last sync) only - never an organization's students, seating or attendance.
- **Organization admin** (`Users` page): creates users, changes roles, disables users, resets passwords, edits organization details. Cannot touch another organization, disable themselves or remove the last admin.
- **Roles:** *Organization admin* (everything), *Exam cell* (everything except users), *Attendance marker* (attendance only), *Viewer* (read-only: dashboard, exams, duty chart, attendance reports). Enforced by the server, by the local repositories (a refused save shows "Your role cannot change ...") and by the menu.
- **Login:** email or username + password (scrypt-hashed), short-lived access token + rotating refresh token, temporary passwords must be changed at first sign-in, disabled users and suspended organizations are cut off on their next request.
- **Speed is unchanged:** the app still reads and writes its local IndexedDB copy (one database per organization per browser). A background sync moves only what changed, in small pieces:
  - every save leaves a small note in a local *outbox*; a sync sends those records in batches of at most 200 records or ~1 MB (a big seating allocation travels alone), each batch stored with a single database statement;
  - pulling asks for "changes after cursor N", 300 per page; the cursor only advances after a page is applied, so an interrupted sync simply resumes;
  - a browser does not receive its own uploads back; other people's changes are merged in (latest write wins per record; attendance is merged per roll number, so two people marking different rooms never collide; deletes travel as tombstones);
  - runs shortly after opening, every N minutes (default 15, set per browser in Settings, or manual only), when the tab regains focus and when the connection returns; failures retry after 1, 2, 5, then 10 minutes;
  - Settings shows status, waiting changes, last sync and lets you press *Sync now*; existing local-only data can be copied into an organization once.
- **Local-only mode** (no server) is exactly the original behaviour: no login, everything stays in the browser.

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
| Backend storage | **Postgres (Supabase)** for organizations, users and synced records (`pg`), or JSON files, or one Google Sheet (`googleapis`) for the original single-organization mode |
| Auth | scrypt password hashing (Node `crypto`), JWT access tokens + rotating refresh tokens (`jsonwebtoken`), login rate limit (`express-rate-limit`) |
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

## Storage, organizations and sync

- **Local-first, always.** The app reads and writes IndexedDB in the browser; screens never wait for the network.
- **Modes**
  - *Local only* (default, no server): no login, data stays in this browser. Optional manual spreadsheet push / pull (`DATA_BACKEND=json|sheets`) remains as before.
  - *Server mode* (`DATA_BACKEND=postgres`): organizations, users, roles and automatic background sync, described below.
- **Server data model** (schema `exam_alloc`, created automatically): `organizations`, `users`, `refresh_tokens`, `audit_log`, and `records` - one row per synced record `(org_id, entity, id)` holding the record as `jsonb`, a `deleted` flag and a global, ever-increasing change number `seq` used as the pull cursor. Synced entities: students, rooms, teachers, exams, allocations, dutyRosters, settings (duty windows, mix groups, institution profile), attendance (per-exam flags) and attendanceMark (one row per exam + roll number).
- **Tenant isolation:** the organization always comes from the signed-in user's token, never from the request. Every query filters by it.
- **Sync algorithm** (`apps/frontend/src/services/syncEngine.ts`, pure helpers in `packages/allocation-engine/src/sync/`):
  1. *Track:* repository wrappers write `(entity, id, put|delete)` into a local outbox on every save.
  2. *Push:* read the latest state of each changed record, cut into batches (<= 200 records, ~1 MB), `POST /api/sync/push`; outbox rows are removed only if the record was not edited again meanwhile. Pushes are serialized per organization and each batch is one SQL statement.
  3. *Pull:* `GET /api/sync/pull?since=<cursor>&limit=300` until `hasMore` is false; each page is applied locally, then the cursor is saved.
  4. *Conflicts:* latest write wins per record; a record with a pending local edit is not overwritten by a pull; attendance marks merge per roll number using `markedAt`; deletes are tombstones.
  5. *Schedule:* after opening, every N minutes (default 15, per browser), on focus / reconnect, or *Sync now*; failures back off 1, 2, 5, 10 minutes.
- **Local-only mode is untouched** and remains the default when no server is configured.

---

## Backend API

Base path `/api`.

**Single-organization mode** (`json` / `sheets`): the original per-entity API - `/api/students`, `/rooms`, `/teachers`, `/exams`, `/allocations`, `/duty` and the manual mirror `/api/sync/:entity` (+ `/bulk`).

**Server mode** (`DATA_BACKEND=postgres`):

| Route | Who | Purpose |
|---|---|---|
| `GET /api/public/config`, `POST /api/public/register` | anyone | is registration open; register an organization (active at once, first admin signed in with the password they chose; rate limited) |
| `POST /api/auth/login`, `/refresh`, `/logout` | anyone | sign in (rate limited), rotate refresh token, sign out |
| `GET /api/auth/me`, `POST /api/auth/change-password` | signed in | profile, change password (also ends other sessions) |
| `GET/POST /api/platform/orgs`, `GET/PATCH /api/platform/orgs/:id` | platform admin | list / register / view / edit / suspend organizations (metadata + counts only) |
| `POST /api/platform/orgs/:id/reset-admin-password`, `GET /api/platform/audit` | platform admin | recovery, activity log |
| `GET/PATCH /api/org` | org members / org admin | organization details |
| `GET/POST /api/org/users`, `PATCH /api/org/users/:id`, `POST /api/org/users/:id/reset-password` | org admin | manage users |
| `POST /api/sync/push`, `GET /api/sync/pull`, `GET /api/sync/status` | org members (push: not viewers; role-limited per entity) | chunked sync |
| `GET /api/health` | anyone | health check |

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
| `DATA_BACKEND` | `json` (default), `sheets`, or `postgres` (organizations, logins, sync) |
| `DATA_DIR` | folder for JSON files (needs a persistent disk on real hosts) |
| `GOOGLE_SHEETS_ID` | spreadsheet id (between `/d/` and `/edit`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | service account; share the sheet with it as Editor |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | its private key, quoted, with `\n` sequences. **Never commit; rotate if exposed.** |

Server mode (`DATA_BACKEND=postgres`) additionally needs:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string. For Supabase use the **Session pooler** string (IPv4, port 5432): `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. The database password exists only here. |
| `JWT_SECRET` | 32+ random characters used to sign login tokens |
| `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD` | first-run platform admin (only if none exists; must change password at first sign-in) |
| `DB_SCHEMA` | schema for all tables (default `exam_alloc`) |
| `PG_POOL_MAX` | max database connections (default 5; the Supabase session pooler allows few clients in total) |
| `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` | token lifetimes (default 30 min / 30 days) |
| `PGSSL` | set `disable` only for a local Postgres without TLS |
| `PUBLIC_REGISTRATION` | `on` (default) lets anyone register an organization; `off` closes it |
| `REGISTER_RATE_LIMIT` | registrations allowed per hour per connection (default 10) |

Frontend (`apps/frontend/.env`, see `.env.example`): `VITE_API_BASE_URL` = the backend address (for example `http://localhost:4000` locally, your Render URL when deployed; set it as an environment variable on the frontend host). When it is set the app starts in server mode (public landing page, sign-in, registration) and never asks for the address. Leave it unset to start in local-only mode (no login, data stays in the browser); "Try as a guest" on the landing page also opens that mode. Only `VITE_` variables reach the browser, so never put a secret there - the database password lives only in the backend environment.

---

## Deployment

- **Frontend → Vercel** (or any static host): root `apps/frontend`, build `npm run build`, output `dist`. `vercel.json` already rewrites all routes to `index.html` for the SPA.
- **Backend → Render:** `render.yaml` at the repository root is a ready Blueprint (root `apps/backend`, `npm install` / `npm start`, health check `/api/health`). Set `DATABASE_URL` (Supabase Session pooler), `JWT_SECRET`, `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD` and `CORS_ORIGIN` in the dashboard; `DATA_BACKEND=postgres` is preset. Other hosts work the same way. Do not use the json backend on hosts with ephemeral disks.
- Because the shared packages are vendored, each app builds from its own folder without the rest of the monorepo.

---

## Testing

`npm run test` runs **114 tests** in `packages/allocation-engine`:

- adjacency, seat graph, capacity and blocked seats
- distribution and per-room branch requirements
- feasibility and rule contradictions
- roll continuity (order, meaning of strict, vs. adjacency, re-entered-room failure)
- year mixing, including the 120-student CSE Year 3 + Year 4 fixture
- minimum rooms and room priority
- subject resolution and row / column / seat subject labels
- duty allocation and duty windows (fair spread across seeds, overlaps, per-day cap, limits, shortfalls, locked rosters)
- attendance: roll-range compression (breaks at absent / missing rolls, letter suffixes) and memo totals (P + A, umc, strays, unseated)
- sync logic: request batching (heavy records travel alone), per-roll attendance diff / merge, retry back-off, role rules
- `realCollegeMix` – 706 students, 6 branches × 2 years, 14 rooms, strict continuity, minimum rooms
- stress – about 1000 students / 20 rooms, time budget and reproducibility

`npm run test:multitenant --workspace=apps/backend` (needs `DATABASE_URL`) starts the real server against a throw-away schema and runs 76 checks: login and password rules, roles, isolation between two organizations, chunked push / pull ordering and paging, tombstones, per-device echo skipping, refresh tokens, suspension, audit log, and open registration (instant activation, duplicate code / login refused, weak password refused, data isolation for the new organization).

The whole flow was also exercised in a real browser against the real backend and database: platform admin creates an organization, the org admin creates users, data is imported and synced in batches, a "second device" (wiped local database) signs in as another role and receives everything, the marker's attendance marks flow back, viewers are refused writes, and the platform dashboard shows counts only.

Beyond unit tests, the app was exercised end to end in a real browser: import the real Excel files, generate all 9 seatings (all seated, all hard checks green), create a duty window and confirm the Duty Chart updates.

---

### Capacity (measured load test)

`DATABASE_URL=... npm run load-test --workspace=apps/backend` starts the real backend on a throw-away schema, registers several organizations with realistic data (700 students, 14 rooms, 9 exams, 9 seating plans each) and measures throughput and latency at rising concurrency. It never touches real data and drops its schema at the end.

Measured from a laptop, so **every database query paid a ~110 ms round trip** to Supabase (Singapore), with a connection pool of 5, then 10:

| Operation | Pool 5 | Pool 10 | Errors |
|---|---|---|---|
| Server itself (health, no database) | ~4,000 req/s | - | 0 |
| Authenticated request (1 query) | ~46 req/s | ~87 req/s | 0 |
| Quiet sync (nothing new; what every user does every N minutes) | ~22 /s | ~41 /s | 0 |
| First-time download page (300 records, ~350 KB) | ~12 /s | ~18 /s | 0 |
| Push of 10 attendance marks | ~7.5 /s | ~13 /s | 0 |
| Push of 200 records | ~7 /s | - | 0 |
| Sign-in (password hashing) | ~16 /s | - | 0 |

Up to 40 simultaneous users there were **no errors**; beyond the limit requests simply queue (latency grows in proportion, nothing fails). Throughput scales with the pool size and is bounded by *round trip x queries per request x pool size*, not by the server's CPU, which is why a backend hosted in the same region as the database (for example Render Singapore next to Supabase Singapore) should handle far more; that projection is an estimate, not a measurement.

What this means in practice: a signed-in user costs about one quiet sync every 15 minutes. At the measured ~22 syncs per second that is on the order of 20,000 users spread evenly, and an exam-morning burst of a few hundred users pressing *Sync now* within a minute is comfortably inside the limit. The heavy work (the seating solver, printing, Excel) runs in the browser and costs the server nothing. Storage is about 1-3 MB per college for a full sessional. Plan-level limits (Supabase free tier storage and connections, Render free tier cold starts) matter before these numbers do.

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
- **Local-first with background sync** – screens never wait for the network; the server is the shared copy and the backup.
- **Open registration, no approval queue** – fewer moving parts for colleges; abuse is limited by rate limiting, the off switch and suspension.
- **The platform admin cannot read organization data** – separation between running the service and the colleges' data.

---

## Known limitations

- Two simultaneous strict adjacency rules on different attributes are not guaranteed (validator flags it).
- Under strict adjacency a room is used at roughly half density per branch; small irregular rooms may stay about half full.
- Server mode: conflicts are "latest write wins" per record (attendance per roll); there is no merge UI. A viewer sees the same screens as other roles, but saves are refused with a message rather than the buttons being hidden.
- Server mode: the Supabase Session pooler limits total connections, so run a single backend instance (or raise the limit with a paid pooler).
- The backend `duty` route still sizes by seat capacity.
- Excel import of per-teacher duty quotas is not implemented (quotas are edited in the Duty Windows page).
- The Help page does not yet describe Excel import or Duty Windows.
- The Google Sheets backend is the original single-organization mode; server mode uses Postgres. Sheets export of server data is not built.
- No email flow: temporary passwords are shown once to whoever creates or resets an account, and registration has no email verification or CAPTCHA (rate limit and suspension are the safeguards).
- PDF is via browser print-to-PDF; there is no one-click PDF download.

---

## Scope, roadmap and future enhancements

Status words used below: **Built** (works, tested), **Backend built** (server side done, screen still to do), **Next** (agreed, first in line), **Planned** (discussed and wanted), **Idea** (worth considering, not committed).

### Where the project stands

| Area | Status |
|---|---|
| Students, rooms (grid + layout editor), teachers, date sheet, Excel / paste import | Built |
| Seat allocation: strict / preferred rules, mixing, roll continuity, minimum rooms, room priority, validator | Built |
| Subject labels per row / column / seat, printable room sheets, Excel per room | Built |
| Duty: per-exam roster, Duty Windows (fair spread over a date range), Duty Chart | Built |
| Attendance marking, absentees, unfair means, strays, attendance sheets, branch-wise reports, answer-book memos | Built |
| Organizations, logins, roles, platform dashboard, org-admin user management | Built |
| Chunked background sync between the browser copy and the server (Postgres) | Built |
| Public landing page (Sign in / Register your organization / Try as a guest) and open registration (no approval) | Built |
| Server address from the environment (`VITE_API_BASE_URL`) | Built |
| Deployment files (Render Blueprint, Vercel SPA rewrite) | Built, not yet run on Render |

### Next (agreed, in this order)
1. **First deployment and hardening on Render + Supabase:** run the Blueprint, set the secrets, rotate the database password, check the connection limit of the Session pooler, add a cold-start note for free tiers.
2. **Absentee import and printable room-wise absent report** (see Attendance below).
3. **Help page refresh:** Excel import, Duty Windows, attendance, memos, organizations and sync.

Already done from the earlier "next" list: the **public landing page** (visitors who are not signed in see a short description with *Sign in*, *Register your organization* - instant, no approval - and *Try as a guest*, which is today's local-only mode with data that can later be copied into an organization from Settings; the registration button disappears when `PUBLIC_REGISTRATION=off`).

### Future enhancements by area

**Attendance, memos and reporting**
- *Planned* - Import absentee lists from Excel or pasted columns (today: tap, type or paste roll numbers).
- *Planned* - **Branch-wise final challan** across a whole sessional (today the memo is per sitting, per paper): per branch, per subject, per session - on roll, present, absent, unfair-means list - built from the attendance data.
- *Planned* - A printable **room-wise absent list** page.
- *Planned* - Editable list of unfair-means reasons (today a fixed list plus "Other").
- *Planned* - Session names taken from the date sheet ("Session-I / II / III") instead of Morning / Evening by start time.
- *Idea* - Answer-book packet / bundle summary, per-invigilator attendance sign-off, QR or barcode on attendance sheets.

**Seating**
- *Planned* - Choose **which room to start seating from** as an explicit option (today: room priority).
- *Planned* - Strict adjacency on **two attributes at once** (for example branch and year) in the lane planner; today the validator flags such a plan instead of guaranteeing it.
- *Idea* - Use the free half of a room more densely when rules allow, reserved seats for special cases, compare two seeds side by side.

**Duty (invigilation)**
- *Planned* - Excel import of per-teacher duty quotas (today edited on the Duty Windows page).
- *Planned* - Make the backend `duty` route (single-organization mode) use students seated, like the app does.
- *Idea* - Teacher availability calendar, swap requests between teachers, notification of duties by SMS / email.

**Accounts, organizations and security**
- *Planned* - **Email invitations, email verification and self-service password reset** (today temporary passwords are shown once on screen).
- *Planned* - Registration safeguards beyond the rate limit: CAPTCHA, email verification, an allow-list of domains if wanted.
- *Planned* - **Branch-scoped roles** (for example an HOD who sees only their branch) and a per-room scope for attendance markers.
- *Planned* - Organization-visible activity log (today only the platform admin sees it).
- *Idea* - Two-factor sign-in for admins, list and revoke signed-in devices, organization data export and deletion on request, scheduled database backups with a restore test.
- *Decided against* - Plan limits per organization (unlimited for now) and an approval queue for new organizations.

**Sync and data**
- *Planned* - A visible **"changed by someone else"** note when an incoming change replaces something you edited.
- *Planned* - Duty rosters, duty windows and mix groups are already synced; add an explicit "reset this browser's copy from the server" action in Settings.
- *Idea* - Live updates (short polling or Supabase Realtime) so an attendance marker's entries appear on the admin's screen without waiting for the next sync; compress large allocations; per-role pull scopes so a marker only downloads the sittings they need.

**Spreadsheet integration**
- *Planned* - One-way, batched **export to Google Sheets** (attendance, memos, challans) for sharing; Postgres stays the source of truth and Sheets is a report mirror, never a database.

**Mobile and offline**
- *Planned* - **Android app with Capacitor** wrapping the existing web build. Needs: a print / PDF plugin instead of `window.open`, Filesystem + Share for Excel downloads, an HTTPS backend, and care that Android may clear WebView storage (the server copy is the backup). Best fit: marking attendance on a phone in the exam hall.
- *Planned* - Installable **PWA** as the cheaper alternative (no store, no wrapper) with an offline shell.
- *Idea* - Keep the signed-in session usable offline for longer with a clear "last synced" warning.

**Printing and export**
- *Planned* - One-click **PDF download** of room sheets, attendance sheets and memos (today: browser print-to-PDF and Excel).
- *Idea* - Institution letterhead per organization, multiple memo templates for different universities, a memo layout editor.

**Quality and operations**
- *Planned* - Continuous integration (typecheck + the 114 engine tests + the backend end-to-end suite on every push), error reporting, a health / metrics dashboard.
- *Planned* - Browser end-to-end tests kept in the repository (today the browser flows were verified by hand-driven scripts).
- *Idea* - Load test with many organizations syncing at once; a written data-protection note for student data.

### Scope

**In scope**
- Deterministic seating for college exams with clear rules, honest validation and reproducible results.
- Invigilation duty planning that is fair over a date range.
- Exam-day attendance, absentees, unfair-means cases and the university's answer-book memo.
- Several colleges on one installation, each with its own users and roles, and a platform owner who can register and suspend organizations but cannot read their data.
- Local-first speed with background sync, usable offline.
- Web first; Android via Capacitor later.

**Out of scope (not planned)**
- AI or machine-learning seat assignment - the engine stays deterministic and explainable.
- Result processing, marks entry, fee collection or fee challans, admissions, timetables for regular classes.
- A student or parent portal, biometric or face-based attendance.
- Paying for or metering usage (no plans or limits).

### Known boundaries today
See [Known limitations](#known-limitations). The main ones: two simultaneous strict adjacency rules on different attributes are not guaranteed; sync conflicts are latest-write-wins per record (attendance per roll number) with no merge screen; registration has no email verification; only one backend instance should run against the Supabase Session pooler; the Render deployment has not been exercised yet.

---

## License

Private project – all rights reserved by the repository owner unless stated otherwise.
