export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="sw-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A597FF" />
            <stop offset="1" stopColor="#4FE0A5" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="10" fill="url(#sw-g)" />
        <path d="M9 12.5h11.5l-3-3M23 19.5H11.5l3 3" stroke="#0B0A17" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="text-[17px]">SWAPLY</span>
    </span>
  );
}
