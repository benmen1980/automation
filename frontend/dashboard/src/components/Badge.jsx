const COLORS = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-600',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  webhook: 'bg-purple-100 text-purple-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-purple-100 text-purple-700',
  user: 'bg-slate-100 text-slate-600',
  viewer: 'bg-slate-100 text-slate-600',
  disabled: 'bg-slate-100 text-slate-500',
};

export default function Badge({ value, children }) {
  const cls = COLORS[value] || 'bg-slate-100 text-slate-600';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children ?? value}</span>;
}
