const COLORS = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  inactive: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  running: 'bg-[#e9faff] text-[#0b5869] ring-1 ring-[#97dbf3]/60',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  webhook: 'bg-[#e9faff] text-[#028baa] ring-1 ring-[#97dbf3]/70',
  scheduled: 'bg-[#f2effa] text-[#4d2f8f] ring-1 ring-[#4d2f8f]/15',
  admin: 'bg-[#f2effa] text-[#4d2f8f] ring-1 ring-[#4d2f8f]/15',
  user: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  viewer: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  disabled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
};

export default function Badge({ value, children }) {
  const cls = COLORS[value] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children ?? value}</span>;
}
