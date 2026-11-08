export function HeartIcon({ size = 24, broken = false }: { size?: number; broken?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.2 4.5 7 4.5c2.1 0 3.6 1.1 5 2.8 1.4-1.7 2.9-2.8 5-2.8 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z"
      />
      {broken && (
        <path d="M12 7.3l-1.5 4 2.5 1.5-1.5 4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      )}
    </svg>
  );
}
