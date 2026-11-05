import type { ReactNode } from 'react';

export default function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between px-4 sm:px-8 pt-6 sm:pt-8 pb-5 tear mx-0 no-print page-enter">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[28px] sm:text-4xl font-semibold text-brand-900 leading-[1.05] tracking-tight">
          <span className="bg-[linear-gradient(transparent_62%,theme(colors.marker.300)_62%,theme(colors.marker.300)_92%,transparent_92%)] px-0.5 -mx-0.5">{title}</span>
        </h1>
        {subtitle && <p className="text-sm text-slate-600 mt-2 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
