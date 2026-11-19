import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { MOROCCO_PATH, projectToMorocco } from '@/lib/moroccoMap';
import { OPERA_MOVES, buildGame, pieceAt } from '@/lib/operaGame';
import { PIECE_SHAPES } from './pieceShapes';

const SCROLL_PX = 12000;
const GAME = buildGame();
const PLIES = OPERA_MOVES.length;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const kufi = "'Reem Kufi', sans-serif";

const CITY_DATA = [
  { name: 'Tangier', ar: 'طنجة', lat: 35.77, lng: -5.8 }, { name: 'Tetouan', ar: 'تطوان', lat: 35.58, lng: -5.37 },
  { name: 'Oujda', ar: 'وجدة', lat: 34.68, lng: -1.91 }, { name: 'Fes', ar: 'فاس', lat: 34.03, lng: -5.0 },
  { name: 'Meknes', ar: 'مكناس', lat: 33.89, lng: -5.55 }, { name: 'Rabat', ar: 'الرباط', lat: 34.02, lng: -6.84 },
  { name: 'Casablanca', ar: 'الدار البيضاء', lat: 33.57, lng: -7.59 }, { name: 'Marrakech', ar: 'مراكش', lat: 31.63, lng: -8.01 },
  { name: 'Essaouira', ar: 'الصويرة', lat: 31.51, lng: -9.77 }, { name: 'Agadir', ar: 'أكادير', lat: 30.43, lng: -9.6 },
  { name: 'Ouarzazate', ar: 'ورزازات', lat: 30.92, lng: -6.89 }, { name: 'Errachidia', ar: 'الرشيدية', lat: 31.93, lng: -4.43 },
  { name: 'Laayoune', ar: 'العيون', lat: 27.15, lng: -13.2 }, { name: 'Dakhla', ar: 'الداخلة', lat: 23.68, lng: -15.93 },
].map((c) => ({ ...c, ...projectToMorocco(c.lat, c.lng) }));

const NAV_PIECES: Record<string, { label: string; ar: string; route: 'tournaments' | 'clubs' | 'players' | 'meetups' }> = {
  wa1: { label: 'Clubs', ar: 'النوادي', route: 'clubs' },
  wc1: { label: 'Meetups', ar: 'اللقاءات', route: 'meetups' },
  we1: { label: 'Tournaments', ar: 'البطولات', route: 'tournaments' },
  wg1: { label: 'Players', ar: 'اللاعبون', route: 'players' },
};

type Counts = Record<string, { id: string | null; t: number; c: number; g: number }>;

export function LandingStory() {
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const sectionRef = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [sel, setSel] = useState('Casablanca');
  const [hoverPiece, setHoverPiece] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const section = sectionRef.current;
      if (!section) return;
      const forced = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('story') : null;
      setP(forced !== null ? clamp(Number(forced)) : clamp(-section.getBoundingClientRect().top / SCROLL_PX));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // real counts per city
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: cityRows } = await supabase.from('cities').select('id, name').in('name', CITY_DATA.map((c) => c.name));
      const byId = new Map<string, string>();
      const out: Counts = {};
      for (const c of CITY_DATA) out[c.name] = { id: null, t: 0, c: 0, g: 0 };
      for (const r of cityRows ?? []) { byId.set(r.id, r.name); if (out[r.name]) out[r.name].id = r.id; }
      const ids = [...byId.keys()];
      if (ids.length) {
        const [tr, cl, ms] = await Promise.all([
          supabase.from('tournaments').select('city_id').eq('status', 'published').in('city_id', ids),
          supabase.from('clubs').select('city_id').in('city_id', ids),
          supabase.from('casual_meetups').select('city_id').in('city_id', ids),
        ]);
        const bump = (rows: { city_id: string }[] | null, field: 't' | 'c' | 'g') => {
          for (const row of rows ?? []) { const n = byId.get(row.city_id); if (n && out[n]) out[n][field] += 1; }
        };
        bump(tr.data, 't'); bump(cl.data, 'c'); bump(ms.data, 'g');
      }
      if (live) setCounts(out);
    })();
    return () => { live = false; };
  }, []);

  // ---- timeline: gate -> choose a piece -> the game -> pieces clear -> map ----
  const gateScale = 0.8 + 2.2 * ease(seg(p, 0, 0.18));
  const gateO = 1 - seg(p, 0.14, 0.2);
  const sx = 1 - 0.94 * ease(seg(p, 0, 0.14));
  const q = PLIES * seg(p, 0.24, 0.55);
  const clear = ease(seg(p, 0.55, 0.62));
  const outline = ease(seg(p, 0.6, 0.7));
  const fill = ease(seg(p, 0.68, 0.74));
  const labelsO = seg(p, 0.17, 0.19) * (1 - seg(p, 0.23, 0.25));
  const shift = ease(seg(p, 0.6, 0.68));
  const cardO = seg(p, 0.78, 0.83);
  const mapLive = p > 0.78;
  const moveNo = Math.min(17, Math.floor(Math.min(q, PLIES - 0.001) / 2) + 1);

  const pieces = useMemo(() => {
    const rows = GAME.map((g) => ({ g, s: pieceAt(g, q) })).filter((r) => r.s.opacity > 0.01);
    return rows.sort((a, b) => Number(a.s.moving) - Number(b.s.moving));
  }, [q]);

  const cur = CITY_DATA.find((c) => c.name === sel) ?? CITY_DATA[6];
  const cc = counts[cur.name] ?? { id: null, t: 0, c: 0, g: 0 };
  const total = cc.t + cc.c + cc.g;

  const squares = [];
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) squares.push(<rect key={`${x}-${y}`} x={x * 100} y={y * 100} width={100} height={100} fill={(x + y) % 2 === 0 ? '#E8E1D0' : '#1A33A0'} />);

  return (
    <section ref={sectionRef} id="story" style={{ position: 'relative', height: `calc(100vh + ${SCROLL_PX}px)` }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: '#0A1235', color: '#EFE9DC' }}>
        {/* the board, flat, behind the gate */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 'min(70vh, 78vw)', aspectRatio: '1 / 1', transform: `translateX(${-16 * shift}vw)` }}>
            <svg viewBox="-50 -50 900 900" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }} role="img" aria-label="Chessboard">
              <defs>
                <pattern id="b-zel" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="#1A33A0" /><g fill="none" stroke="#6F8CF0" strokeWidth="1"><rect x="9" y="9" width="18" height="18" /><rect x="9" y="9" width="18" height="18" transform="rotate(45 18 18)" /></g><circle cx="18" cy="18" r="2" fill="#E2B24A" /></pattern>
                <pattern id="b-map" width="56" height="56" patternUnits="userSpaceOnUse"><rect width="56" height="56" fill="#0E1B66" /><g fill="none" stroke="#3B5BD0" strokeWidth="1.2"><rect x="14" y="14" width="28" height="28" /><rect x="14" y="14" width="28" height="28" transform="rotate(45 28 28)" /></g><circle cx="28" cy="28" r="3" fill="#E2B24A" /></pattern>
              </defs>
              <rect x="-50" y="-50" width="900" height="900" fill="url(#b-zel)" />
              <rect x="-6" y="-6" width="812" height="812" fill="none" stroke="#E2B24A" strokeWidth="3" />
              <g opacity={1 - 0.68 * fill}>{squares}</g>

              {/* the map draws itself on the board */}
              <g transform="translate(70 46) scale(.66)">
                <path d={MOROCCO_PATH} fill="#0A1235" opacity={fill * 0.92} />
                <path d={MOROCCO_PATH} fill="url(#b-map)" opacity={fill} />
                <path d={MOROCCO_PATH} pathLength={1} fill="none" stroke="#F0C75E" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - outline} style={{ filter: 'drop-shadow(0 0 8px rgba(226,178,74,.8))' }} />
                {CITY_DATA.map((c, i) => {
                  const r = clamp((p - (0.72 + i * 0.005)) / 0.05);
                  if (r <= 0) return null;
                  const on = c.name === sel;
                  const s = easeOutBack(r) * (on ? 1.35 : 1);
                  return (
                    <g key={c.name} transform={`translate(${c.x} ${c.y}) scale(${s})`} style={{ cursor: mapLive ? 'pointer' : 'default', pointerEvents: mapLive ? 'auto' : 'none' }}
                      onMouseEnter={() => setSel(c.name)} onClick={() => setSel(c.name)}>
                      <circle r="34" fill="transparent" />
                      {on && <circle r="22" fill="none" stroke="#FFE9A8" strokeWidth="4" opacity=".8" />}
                      <circle r="15" fill={on ? '#FFE9A8' : '#E2B24A'} stroke="#0A1235" strokeWidth="5" />
                      {on && <text y="-32" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="36" fill="#EFE9DC" stroke="#0A1235" strokeWidth="8" paintOrder="stroke">{c.name}</text>}
                    </g>
                  );
                })}
              </g>

              {labelsO > 0.01 && Object.keys(NAV_PIECES).map((id) => {
                const g = GAME.find((x) => x.id === id);
                return g ? <line key={id} x1={g.x0 * 100 + 50} y1={g.y0 * 100 + 92} x2={g.x0 * 100 + 50} y2={872} stroke="#E2B24A" strokeWidth="2" opacity={labelsO * 0.8} /> : null;
              })}
              {/* the Opera Game */}
              {clear < 1 && pieces.map(({ g, s }) => {
                const cx = s.x * 100 + 50;
                const cy = s.y * 100 + 50;
                const dx = cx - 400, dy = cy - 400, d = Math.hypot(dx, dy) || 1;
                const out = 1100 * clear;
                const nav = NAV_PIECES[g.id];
                const lit = nav && hoverPiece === g.id;
                const live = Boolean(nav) && labelsO > 0.5;
                return (
                  <g key={g.id} transform={`translate(${cx + (dx / d) * out} ${cy + (dy / d) * out}) scale(${s.scale * (lit ? 1.12 : 1) * 1.08}) translate(-50 -50)`} opacity={s.opacity * (1 - clear)}
                    style={{ cursor: live ? 'pointer' : 'default', pointerEvents: live ? 'auto' : 'none' }}
                    onMouseEnter={() => nav && setHoverPiece(g.id)} onMouseLeave={() => setHoverPiece(null)} onClick={() => nav && navigate({ name: nav.route })}>
                    <ellipse cx="50" cy="90" rx="26" ry="4" fill="#0A1235" opacity=".25" />
                    <g fill={g.white ? '#EFE9DC' : '#0A1235'} stroke={g.white ? '#0A1235' : '#E2B24A'} strokeWidth="2.6" strokeLinejoin="round" style={{ ['--ink' as string]: g.white ? '#0A1235' : '#E2B24A' }} dangerouslySetInnerHTML={{ __html: PIECE_SHAPES[g.type] }} />
                  </g>
                );
              })}
            </svg>

            {/* labels on the four piece-buttons */}
            {labelsO > 0.01 && Object.entries(NAV_PIECES).map(([id, n]) => {
              const piece = GAME.find((g) => g.id === id);
              if (!piece) return null;
              return (
                <button key={id} type="button" onClick={() => navigate({ name: n.route })} onMouseEnter={() => setHoverPiece(id)} onMouseLeave={() => setHoverPiece(null)}
                  style={{ position: 'absolute', left: `${((piece.x0 * 100 + 100) / 900) * 100}%`, top: `${((872 + 50) / 900) * 100}%`, transform: 'translate(-50%, 0)', opacity: labelsO, pointerEvents: labelsO > 0.5 ? 'auto' : 'none', cursor: 'pointer', border: '1px solid #E2B24A', background: hoverPiece === id ? '#E2B24A' : 'rgba(10,18,53,.94)', color: hoverPiece === id ? '#0A1235' : '#EFE9DC', padding: '5px 12px', textAlign: 'center', whiteSpace: 'nowrap', transition: 'background .2s, color .2s' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{t(n.label)}</div>
                  <div style={{ fontFamily: kufi, fontSize: 15 }}>{n.ar}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* gate: the doorway is a real hole, so the board shows through it */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: gateO, visibility: gateO <= 0.001 ? 'hidden' : 'visible' }}>
          <div style={{ height: 'min(88vh, 860px)', aspectRatio: '640 / 860', transformOrigin: '50% 62%', transform: `scale(${gateScale})` }}>
            <GateSvg sx={sx} />
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', pointerEvents: 'none', opacity: 1 - seg(p, 0.03, 0.1) }}>
          <div style={{ fontFamily: kufi, fontSize: 26, fontWeight: 600 }}>قهوة شطرنج</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.75 }}>{t('Chess in Morocco')}</div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 30, textAlign: 'center', pointerEvents: 'none', opacity: 1 - seg(p, 0, 0.03) }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.7 }}>{t('Scroll')}</div>
          <div style={{ width: 1, height: 34, margin: '10px auto 0', background: '#E2B24A' }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', pointerEvents: 'none', opacity: labelsO, fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase' }}>
          {t('Choose a piece, or keep scrolling')}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', pointerEvents: 'none', opacity: seg(p, 0.26, 0.3) * (1 - seg(p, 0.52, 0.56)), fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase' }}>
          {t('Morphy vs. Duke of Brunswick · Paris 1858')} · {t('Move')} {moveNo}
        </div>

        {/* map card */}
        <div style={{ position: 'absolute', right: 'max(24px, 5vw)', top: '50%', transform: 'translateY(-50%)', width: 330, opacity: cardO, pointerEvents: cardO > 0.5 ? 'auto' : 'none' }}>
          <div style={{ fontFamily: kufi, fontSize: 24, fontWeight: 600, color: '#E2B24A' }}>الخريطة</div>
          <div style={{ margin: '4px 0 16px', fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase' }}>{t('Map')}</div>
          <div style={{ border: '1px solid rgba(226,178,74,.55)', padding: '20px 22px', background: 'rgba(10,18,53,.85)' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{cur.name}</div>
            <div style={{ fontFamily: kufi, fontSize: 18, color: '#E2B24A', marginBottom: 12 }}>{cur.ar}</div>
            {([['Tournaments', cc.t], ['Clubs', cc.c], ['Casual games', cc.g]] as const).map(([label, n]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(239,233,220,.15)', fontSize: 15 }}><span>{t(label)}</span><b>{n}</b></div>
            ))}
            {total === 0 && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(239,233,220,.65)' }}>{t('Nothing here yet. Be the first to organize something.')}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {cc.id && <button type="button" onClick={() => navigate({ name: 'city', id: cc.id! })} style={btnStyle}>{t('View city')}</button>}
              <button type="button" onClick={() => navigate({ name: 'map' })} style={btnStyle}>{t('Open full map')}</button>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6, color: 'rgba(239,233,220,.7)' }}>{t('Hover or tap a pin to explore a city.')}</p>
        </div>
      </div>
    </section>
  );
}

const btnStyle: React.CSSProperties = { border: '1px solid rgba(239,233,220,.4)', background: 'none', color: '#EFE9DC', font: '600 12px Inter, sans-serif', padding: '8px 14px', cursor: 'pointer' };

function GateSvg({ sx }: { sx: number }) {
  const knocker = (x: number) => (<><circle cx={x} cy="560" r="13" fill="none" stroke="#7E5510" strokeWidth="4" /><circle cx={x} cy="545" r="5" fill="#7E5510" /></>);
  return (
    <svg viewBox="0 0 640 860" style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }} role="img" aria-label="Fes palace gate">
      <defs>
        <pattern id="g-zel" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#1A33A0" /><g fill="none" stroke="#6F8CF0" strokeWidth="1"><rect x="8" y="8" width="16" height="16" /><rect x="8" y="8" width="16" height="16" transform="rotate(45 16 16)" /></g><circle cx="16" cy="16" r="1.8" fill="#E2B24A" /></pattern>
        <pattern id="g-dark" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#13277F" /><g fill="none" stroke="#3B5BD0" strokeWidth="1"><rect x="7" y="7" width="14" height="14" /><rect x="7" y="7" width="14" height="14" transform="rotate(45 14 14)" /></g></pattern>
        <pattern id="g-medal" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="#2146C4" /><circle cx="22" cy="22" r="11" fill="none" stroke="#EFE9DC" strokeWidth="2" /><circle cx="22" cy="22" r="4" fill="#E2B24A" /></pattern>
        <pattern id="g-brass" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#D9A93D" /><rect width="32" height="32" fill="#BE8C26" /><rect x="32" y="32" width="32" height="32" fill="#BE8C26" />
          <g fill="none" stroke="#7E5510" strokeWidth="1.3">{[[6, 6, 16, 16], [38, 6, 48, 16], [6, 38, 16, 48], [38, 38, 48, 48]].map(([x, y, cx, cy]) => (<g key={`${x}-${y}`}><rect x={x} y={y} width="20" height="20" /><rect x={x} y={y} width="20" height="20" transform={`rotate(45 ${cx} ${cy})`} /></g>))}</g>
          <g fill="#F0CC74"><circle cx="16" cy="16" r="2.2" /><circle cx="48" cy="16" r="2.2" /><circle cx="16" cy="48" r="2.2" /><circle cx="48" cy="48" r="2.2" /></g></pattern>
        <linearGradient id="g-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset=".5" stopColor="#fff" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".18" /></linearGradient>
        <mask id="g-hole" maskUnits="userSpaceOnUse" x="-4000" y="-3000" width="8640" height="6860"><rect x="-4000" y="-3000" width="8640" height="6860" fill="#fff" /><path d="M154 800V391A172 172 0 1 1 486 391V800Z" fill="#000" /></mask>
        <clipPath id="g-open"><path d="M154 800V391A172 172 0 1 1 486 391V800Z" /></clipPath>
      </defs>
      <g mask="url(#g-hole)">
        <rect x="-4000" y="-3000" width="8640" height="6860" fill="#0A1235" />
        <rect width="640" height="860" fill="url(#g-zel)" />
        <rect x="18" y="18" width="604" height="824" fill="none" stroke="url(#g-dark)" strokeWidth="36" />
        <rect x="36" y="36" width="568" height="788" fill="none" stroke="#E2B24A" strokeWidth="2" />
        <rect x="52" y="52" width="536" height="772" fill="url(#g-dark)" />
        <path d="M100 800V417A230 230 0 1 1 540 417V800Z" fill="url(#g-medal)" stroke="#E2B24A" strokeWidth="2" />
        <path d="M130 800V404A198 198 0 1 1 510 404V800Z" fill="#EFE9DC" />
        <path d="M130 800V404A198 198 0 1 1 510 404V800" fill="none" stroke="#EFE9DC" strokeWidth="12" strokeDasharray="0 13" strokeLinecap="round" />
      </g>
      <g clipPath="url(#g-open)">
        <g transform={`translate(154 0) scale(${sx} 1) translate(-154 0)`}><rect x="154" y="170" width="166.5" height="640" fill="url(#g-brass)" /><rect x="154" y="170" width="166.5" height="640" fill="url(#g-sheen)" />{knocker(296)}</g>
        <g transform={`translate(486 0) scale(${sx} 1) translate(-486 0)`}><rect x="319.5" y="170" width="166.5" height="640" fill="url(#g-brass)" /><rect x="319.5" y="170" width="166.5" height="640" fill="url(#g-sheen)" />{knocker(344)}</g>
      </g>
    </svg>
  );
}
