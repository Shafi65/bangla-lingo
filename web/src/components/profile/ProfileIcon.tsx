/** Nav icon for the profile: a rosette badge on a ribbon (the badges' own shape). */
export function ProfileIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="6" />
      <circle cx="12" cy="9" r="2.2" />
      <path d="M8.5 14L7 21l5-2.5L17 21l-1.5-7" />
    </svg>
  );
}
