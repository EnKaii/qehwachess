import { useLanguage } from '@/context/LanguageContext';

export interface PodiumPlace { name: string; points: string }

const FINIAL = ['#E2B24A', '#D8D2C2', '#C58B54'];
const NUMERAL = ['١', '٢', '٣'];
const HEIGHTS = [260, 205, 170]; // body height by rank (1st tallest)

const arch = (x: number, w: number, top: number, bottom: number) => {
  const r = 0.54 * w;
  const yj = top + r + Math.sqrt(r * r - (w / 2) ** 2);
  return `M${x} ${bottom}V${yj.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${x + w} ${yj.toFixed(1)}V${bottom}Z`;
};

/** A Koutoubia-style minaret: zellige band, sebka lattice, a window with the rank, lantern tower and a three-sphere finial. */
function Tower({ rank, place }: { rank: number; place: PodiumPlace }) {
  const h = HEIGHTS[rank];
  const bottom = 100 + h;
  const color = FINIAL[rank];
  const total = bottom + 10;
  return (
    <div className="flex flex-col items-center" style={{ width: rank === 0 ? '36%' : '31%' }}>
      <div className="mb-2 w-full truncate text-center text-sm font-semibold text-white">{place.name}</div>
      <svg viewBox={`0 0 120 ${total}`} className="block w-full" role="img" aria-label={`${rank + 1}: ${place.name}, ${place.points}`}>
        <defs>
          <pattern id={`mn-zel-${rank}`} width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#1A33A0" /><g fill="none" stroke="#6F8CF0" strokeWidth=".8"><rect x="5" y="5" width="10" height="10" /><rect x="5" y="5" width="10" height="10" transform="rotate(45 10 10)" /></g><circle cx="10" cy="10" r="1.3" fill="#E2B24A" /></pattern>
          <pattern id={`mn-seb-${rank}`} width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#10228A" /><path d="M0 12L12 0L24 12L12 24Z" fill="none" stroke="#E2B24A" strokeWidth=".9" /><circle cx="12" cy="12" r="2" fill="#E2B24A" /></pattern>
        </defs>
        {/* finial: three spheres on a pole, the crown of every Moroccan minaret */}
        <line x1="60" y1="40" x2="60" y2="12" stroke={color} strokeWidth="2" />
        <circle cx="60" cy="31" r="6.5" fill={color} /><circle cx="60" cy="21" r="4.8" fill={color} /><circle cx="60" cy="13" r="3.2" fill={color} />
        {/* lantern tower */}
        <polygon points="36,58 60,40 84,58" fill={color} />
        <rect x="40" y="58" width="40" height="30" fill="#13277F" stroke="#E2B24A" strokeWidth="1.5" />
        <path d="M52 88V72A8 8 0 0 1 68 72V88Z" fill="#0A1235" />
        {/* stepped merlons */}
        {[0, 1, 2, 3, 4].map((i) => <polygon key={i} points={`${10 + i * 20},100 ${20 + i * 20},87 ${30 + i * 20},100`} fill="#13277F" stroke="#E2B24A" strokeWidth="1.2" />)}
        {/* shaft */}
        <rect x="10" y="100" width="100" height={h} fill="#1A33A0" stroke="#E2B24A" strokeWidth="1.8" />
        <rect x="17" y="108" width="86" height="20" fill={`url(#mn-zel-${rank})`} stroke="#E2B24A" strokeWidth=".8" />
        <rect x="17" y="134" width="86" height={Math.min(h * 0.3, bottom - 88 - 6 - 134)} fill={`url(#mn-seb-${rank})`} stroke="#E2B24A" strokeWidth=".8" />
        <path d={arch(34, 52, bottom - 88, bottom - 14)} fill="#0A1235" stroke="#E2B24A" strokeWidth="1.5" />
        <text x="60" y={bottom - 32} textAnchor="middle" fontFamily="'Reem Kufi', sans-serif" fontSize="36" fontWeight="600" fill={color}>{NUMERAL[rank]}</text>
        <rect x="4" y={bottom - 8} width="112" height="8" fill="#0F1C52" stroke="#E2B24A" strokeWidth="1" />
      </svg>
      <div className="mt-2 text-center text-xs font-semibold text-gray-400">{place.points}</div>
    </div>
  );
}

export function MinaretPodium({ places }: { places: PodiumPlace[] }) {
  const { t } = useLanguage();
  if (places.length < 3) return null;
  return (
    <div className="mb-6 flex items-end justify-center gap-3" aria-label={t('Podium')}>
      <Tower rank={1} place={places[1]} />
      <Tower rank={0} place={places[0]} />
      <Tower rank={2} place={places[2]} />
    </div>
  );
}
