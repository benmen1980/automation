export default function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="brand-logo-frame">
        <img src="/simplyct_aman_logo.png" alt="SimplyCT Aman" className="brand-logo" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#0b5869] leading-tight">SimplyCT</span>
          <span className="block text-xs font-medium text-[#4d2f8f] leading-tight">Automation Platform</span>
        </span>
      )}
    </div>
  );
}
