/** Original mark: green tile with a red "sun" and the letter বা. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#006a4e" />
      <circle cx="17" cy="20" r="11" fill="#f42a41" />
      <text
        x="17"
        y="25.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#fff"
        fontFamily="'Noto Sans Bengali Variable','Noto Sans Bengali',sans-serif"
      >
        বা
      </text>
    </svg>
  );
}
