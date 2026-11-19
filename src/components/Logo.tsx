/** Qehwa Chess mark: the eight-pointed zellige star with a chessboard at its heart. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="Qehwa Chess">
      <g fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="9" y="9" width="30" height="30" />
        <rect x="9" y="9" width="30" height="30" transform="rotate(45 24 24)" />
      </g>
      <rect x="18" y="18" width="6" height="6" fill="#E2B24A" />
      <rect x="24" y="24" width="6" height="6" fill="#E2B24A" />
      <rect x="24" y="18" width="6" height="6" fill="currentColor" />
      <rect x="18" y="24" width="6" height="6" fill="currentColor" />
    </svg>
  );
}
