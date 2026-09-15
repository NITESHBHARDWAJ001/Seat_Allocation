import PageHeader from '../components/PageHeader.js';

const STEPS = [
  { title: 'Add Students', body: 'Students page: add one at a time, or paste a whole roster via Bulk Import ("rollNumber, name, branch, year, section"). Roll numbers can be any format — CSE24001, 24-CSE-001, whatever your college uses.' },
  { title: 'Add Rooms', body: 'Rooms page: create a regular grid room (rows × seats per row) or bulk-import several at once. Open a room\'s layout to click-block individual seats (broken desk, reserved, etc.) — blocked seats are never used.' },
  { title: 'Add Teachers', body: 'Teachers page: add invigilators with a name and branch (used for the "avoid own-branch invigilation" option later), or bulk import "name, branch[, email, phone]".' },
  { title: 'Schedule the Exam(s)', body: 'Exams page: create one exam by hand (pick students, rooms, and optional per-branch+year subjects), or use Import Datesheet to paste a whole schedule at once — rows sharing the same date+time become one exam session automatically.' },
  { title: 'Configure Rules', body: 'On an exam\'s page, Edit Rules controls adjacency (who can\'t sit next to whom), roll-number/branch continuity, room distribution, and utilization strategy — all before you generate.' },
  { title: 'Generate Seat Allocation', body: 'Click Generate Allocation. The engine checks feasibility first, then solves with a real constraint-satisfaction algorithm (not random shuffling) — you get a validation report, a score, and a room-by-room seating map. Manually drag a student to a different seat if needed.' },
  { title: 'Generate Duty Roster', body: 'On the same exam page, set seats-per-invigilator (bigger rooms automatically get more invigilators), optional max-duties-per-day / max-duties-total caps, and whether to avoid own-branch invigilation, then Generate Duty Roster. It won\'t double-book a teacher across overlapping exams.' },
  { title: 'Review & Export', body: 'Check the Duty Chart for a teacher-by-teacher view across every exam. Export the seating report as CSV/JSON, or print a per-room seating sheet (invigilator and subjects included).' },
];

const REFERENCE = [
  { title: 'Students', body: 'CRUD, search/filter by branch/year/section, bulk paste import, CSV export. Duplicate roll numbers and missing fields are flagged automatically.' },
  { title: 'Rooms', body: 'Regular-grid or bulk-imported rooms; the visual Layout Editor lets you block/unblock individual seats for irregular layouts (a broken desk, a reserved seat, etc.).' },
  { title: 'Teachers', body: 'Invigilator roster: name, branch, optional email/phone. Feeds the duty allocator.' },
  { title: 'Exams', body: 'Each exam has its own student/room selection, rule config, subject assignments, seat allocation, and duty roster — all versioned, so regenerating never destroys the previous result.' },
  { title: 'Subjects Per Group', body: 'Assign one subject per branch+year for an exam (e.g. CSE-Y2 writes Data Structures while ECE-Y2 writes Signals in the same session) — conflicting duplicate assignments are flagged before you generate.' },
  { title: 'Allocation Rules', body: 'Adjacency (horizontal/vertical/diagonal, per branch/year/section/batch), roll-number and branch continuity, explicit room/branch distribution, utilization strategy — each strict or preferred.' },
  { title: 'Seat Allocation', body: 'A real backtracking constraint-satisfaction solver, not a greedy shuffle. Reports feasibility before running, validates the result independently afterward, and supports manual seat overrides with conflict warnings.' },
  { title: 'Duty Roster', body: 'Round-robin, seeded (reproducible) assignment across rooms, scaled to room capacity (seats-per-invigilator), with optional per-day/total workload caps and own-branch avoidance. Supports manual reassignment.' },
  { title: 'Duty Chart', body: 'A teacher × exam-date matrix showing every invigilation assignment across the whole schedule at a glance.' },
  { title: 'Reports & Export', body: 'Student-wise and branch/room breakdown tables, CSV/JSON export, and a printable per-room seating sheet with invigilator and subject filled in.' },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="Help" subtitle="How the whole workflow fits together" />
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Getting started, step by step</h2>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-800">{step.title}</div>
                  <div className="text-sm text-slate-600">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Page reference</h2>
          <div className="space-y-3">
            {REFERENCE.map((r) => (
              <div key={r.title}>
                <div className="text-sm font-medium text-slate-800">{r.title}</div>
                <div className="text-sm text-slate-600">{r.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">A note on conflicts</h2>
          <p className="text-sm text-slate-600">
            The app never silently produces an invalid arrangement. Seat allocation and duty rosters are both
            re-validated independently after generation and after every manual change — hard constraints (double
            booking, blocked seats, strict adjacency, strict room requirements) are never violated; soft preferences
            (roll continuity, branch balance, own-branch avoidance) are scored so you can see the trade-off, and any
            genuine shortfall (not enough seats, not enough teachers) is reported with the specific reason instead of
            a generic failure.
          </p>
        </div>
      </div>
    </div>
  );
}
