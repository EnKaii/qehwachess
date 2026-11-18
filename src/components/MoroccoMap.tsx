import { MOROCCO_PATH, MOROCCO_VIEWBOX, projectToMorocco } from '@/lib/moroccoMap';

export interface MapPoint {
  key: string;
  lat: number;
  lng: number;
  label: string;
  /** How many things happen here; makes the pin a little bigger. */
  count?: number;
}

interface Props {
  points: MapPoint[];
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  user?: { lat: number; lng: number } | null;
  /** Background mode: small dots, no interaction, hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
}

const PAD = 40;
const fill = (name: string, alpha = 1) => `rgb(var(--tw-${name}) / ${alpha})`;

export function MoroccoMap({ points, selectedKey, onSelect, user, decorative = false, className }: Props) {
  const { width, height } = MOROCCO_VIEWBOX;
  const userPoint = user ? projectToMorocco(user.lat, user.lng) : null;
  const sorted = [...points].sort((a, b) => Number(a.key === selectedKey) - Number(b.key === selectedKey));

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
      className={className}
      role={decorative ? undefined : 'group'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Map of Morocco'}
      onClick={() => onSelect?.(null)}
    >
      <defs>
        <pattern id="zellige-fill" width="40" height="40" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={fill('brand-500', 0.22)} strokeWidth="1">
            <rect x="11" y="11" width="18" height="18" />
            <rect x="11" y="11" width="18" height="18" transform="rotate(45 20 20)" />
          </g>
        </pattern>
      </defs>
      <path d={MOROCCO_PATH} fill={fill('surface-800')} stroke="none" />
      <path d={MOROCCO_PATH} fill="url(#zellige-fill)" stroke="none" />
      <path d={MOROCCO_PATH} fill="none" stroke={fill('brand-500', 0.85)} strokeWidth="2.5" strokeLinejoin="round" />

      {sorted.map((pt) => {
        const { x, y } = projectToMorocco(pt.lat, pt.lng);
        if (decorative) return <circle key={pt.key} cx={x} cy={y} r="3" fill={fill('accent-400', 0.75)} />;
        const selected = pt.key === selectedKey;
        const r = 7 + Math.min(pt.count ?? 1, 5) * 1.5;
        return (
          <g
            key={pt.key}
            role="button"
            tabIndex={0}
            aria-label={pt.label}
            aria-pressed={selected}
            className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-[3]"
            onClick={(e) => { e.stopPropagation(); onSelect?.(selected ? null : pt.key); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(selected ? null : pt.key); } }}
          >
            <circle cx={x} cy={y} r={r + 8} fill="transparent" stroke={selected ? fill('accent-300') : 'transparent'} strokeWidth="2" />
            <circle cx={x} cy={y} r={r} fill={fill('accent-400')} stroke={fill('surface-900')} strokeWidth="3" />
            <title>{pt.label}</title>
            {selected && (
              <text x={x} y={y - r - 14} textAnchor="middle" fontSize="26" fontWeight="700"
                fill={fill('accent-200')} stroke={fill('surface-950')} strokeWidth="5" paintOrder="stroke">
                {pt.label}
              </text>
            )}
          </g>
        );
      })}

      {userPoint && (
        <g aria-label="Your location">
          <circle cx={userPoint.x} cy={userPoint.y} r="16" fill={fill('brand-400', 0.25)} />
          <circle cx={userPoint.x} cy={userPoint.y} r="7" fill={fill('brand-400')} stroke="#fff" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}
