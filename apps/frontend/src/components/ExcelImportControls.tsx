import { useRef, useState } from 'react';
import { COLUMNS, SHEET_NAMES, downloadTemplate, readTable, type ImportKind, type ParsedTable } from '../services/excelImport.js';

type ParsedRecord = ParsedTable['records'][number];

/**
 * "Import Excel" + "Download template" controls shared by the Students,
 * Teachers and Datesheet imports. Reads the chosen .xlsx, shows every
 * row-level problem (with Excel row numbers) and imports nothing if any row
 * is invalid - the same all-or-nothing rule as the paste imports.
 */
export default function ExcelImportControls({
  kind,
  onImport,
}: {
  kind: ImportKind;
  /** Receives the validated rows; returns a short success summary shown to the user. */
  onImport: (records: ParsedRecord[]) => Promise<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setErrors([]);
    setSuccess(null);
    try {
      const table = await readTable(file, kind);
      if (table.errors.length > 0) {
        setErrors(table.errors);
        return;
      }
      setSuccess(await onImport(table.records));
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const headers = COLUMNS[kind].map((c) => c.header + (c.required ? '*' : '')).join(', ');

  return (
    <div className="card p-4 space-y-2">
      <div className="text-sm font-medium text-slate-700">Import from Excel</div>
      <p className="text-xs text-slate-500">
        Upload an <code>.xlsx</code> file with a header row: <code>{headers}</code>. Sheet named "{SHEET_NAMES[kind]}" is used
        if present, otherwise the first sheet. Column order does not matter.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Reading…' : 'Import Excel (.xlsx)'}
        </button>
        <button className="btn-secondary" onClick={() => void downloadTemplate()}>
          Download Excel template
        </button>
        <span className="text-xs text-slate-400">The template has all three sheets (Students, Teachers, Datesheet) with example rows.</span>
      </div>
      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="font-semibold mb-1">Nothing was imported - fix these and try again ({errors.length}):</div>
          <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
            {errors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 50 && <li>…and {errors.length - 50} more.</li>}
          </ul>
        </div>
      )}
      {success && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{success}</div>}
    </div>
  );
}
