export function AppIcon({ name }: { name: 'home' | 'plan' | 'chart' | 'bulb' | 'logout' | 'close' | 'eye' | 'eye-off' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'home' && <path d="m3 10 9-7 9 7v11h-6v-8H9v8H3Z" />}
    {name === 'plan' && <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v5M16 3v5M4 11h16" /></>}
    {name === 'chart' && <path d="M4 3v17h17M8 7v9h10M8 13l4-4 3 3 5-7" />}
    {name === 'bulb' && <><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 2H9Z" /></>}
    {name === 'logout' && <path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" />}
    {name === 'close' && <path d="m15 3-9 9 9 9" />}
    {(name === 'eye' || name === 'eye-off') && <><path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{name === 'eye-off' && <path d="m3 3 18 18" />}</>}
  </svg>;
}
