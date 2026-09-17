interface MultiSelectFilterProps<T extends string | number> {
  label: string;
  options: T[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  formatOption?: (opt: T) => string;
  className?: string;
}

/**
 * Checkbox dropdown for filtering by multiple values at once (e.g. several
 * branches or years together), instead of one dropdown value at a time.
 * Built on <details>/<summary> so open/close needs no extra JS state.
 */
export default function MultiSelectFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  formatOption = (o) => String(o),
  className = '',
}: MultiSelectFilterProps<T>) {
  function toggle(option: T) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  }

  const summaryText = selected.size === 0 ? `All ${label.toLowerCase()}` : `${label}: ${selected.size} selected`;

  return (
    <details className={`relative inline-block ${className}`}>
      <summary className="input cursor-pointer select-none list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
        {summaryText}
        <span className="text-slate-400 text-[10px]">▾</span>
      </summary>
      <div className="absolute z-10 mt-1 w-48 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg py-1">
        <button
          type="button"
          className="w-full text-left px-3 py-1 text-xs text-brand-700 hover:bg-slate-50"
          onClick={() => onChange(new Set())}
        >
          Clear (show all)
        </button>
        <div className="border-t border-slate-100 my-1" />
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
            <span>{formatOption(option)}</span>
          </label>
        ))}
        {options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No options.</div>}
      </div>
    </details>
  );
}
