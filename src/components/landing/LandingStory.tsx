import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { ChessWorld, type ButtonSpec, type WorldPin } from './ChessWorld';

const SCROLL_PX = 6800;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

const CITY_DATA = [
  { name: 'Tangier', ar: 'طنجة', lat: 35.77, lng: -5.8 }, { name: 'Tetouan', ar: 'تطوان', lat: 35.58, lng: -5.37 },
  { name: 'Oujda', ar: 'وجدة', lat: 34.68, lng: -1.91 }, { name: 'Fes', ar: 'فاس', lat: 34.03, lng: -5.0 },
  { name: 'Meknes', ar: 'مكناس', lat: 33.89, lng: -5.55 }, { name: 'Rabat', ar: 'الرباط', lat: 34.02, lng: -6.84 },
  { name: 'Casablanca', ar: 'الدار البيضاء', lat: 33.57, lng: -7.59 }, { name: 'Marrakech', ar: 'مراكش', lat: 31.63, lng: -8.01 },
  { name: 'Essaouira', ar: 'الصويرة', lat: 31.51, lng: -9.77 }, { name: 'Agadir', ar: 'أكادير', lat: 30.43, lng: -9.6 },
  { name: 'Ouarzazate', ar: 'ورزازات', lat: 30.92, lng: -6.89 }, { name: 'Errachidia', ar: 'الرشيدية', lat: 31.93, lng: -4.43 },
  { name: 'Laayoune', ar: 'العيون', lat: 27.15, lng: -13.2 }, { name: 'Dakhla', ar: 'الداخلة', lat: 23.68, lng: -15.93 },
];

const BUTTONS: (ButtonSpec & { label: string; ar: string; route: 'tournaments' | 'clubs' | 'players' | 'meetups' })[] = [
  { key: 'tournaments', type: 'king', col: 1, row: 2, label: 'Tournaments', ar: 'البطولات', route: 'tournaments' },
  { key: 'clubs', type: 'rook', col: 6, row: 2, label: 'Clubs', ar: 'النوادي', route: 'clubs' },
  { key: 'players', type: 'queen', col: 1, row: 5, label: 'Players', ar: 'اللاعبون', route: 'players' },
  { key: 'meetups', type: 'bishop', col: 6, row: 5, label: 'Casual meetups', ar: 'اللقاءات', route: 'meetups' },
];

type Counts = Record<string, { id: string | null; t: number; c: number; g: number }>;
const kufi = "'Reem Kufi', sans-serif";

export function LandingStory() {
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gateLayer = useRef<HTMLDivElement>(null);
  const gateWrap = useRef<HTMLDivElement>(null);
  const leftLeaf = useRef<SVGGElement>(null);
  const rightLeaf = useRef<SVGGElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const holdHint = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const worldRef = useRef<ChessWorld | null>(null);
  const progress = useRef(0);
  const [sel, setSel] = useState('Casablanca');
  const [counts, setCounts] = useState<Counts>({});
  const [noGl, setNoGl] = useState(false);

  const pins = useMemo<WorldPin[]>(
    () => CITY_DATA.map((c) => ({ key: c.name, name: c.name, lat: c.lat, lng: c.lng, weight: (counts[c.name]?.t ?? 0) + (counts[c.name]?.c ?? 0) + (counts[c.name]?.g ?? 0) })),
    [counts],
  );
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

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

  // 3D world
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const section = sectionRef.current;
    if (!canvas || !stage || !section) return;
    let world: ChessWorld;
    try {
      world = new ChessWorld(canvas, BUTTONS, pinsRef.current, {
        onPieceClick: (key) => { const b = BUTTONS.find((x) => x.key === key); if (b) navigate({ name: b.route }); },
        onPinHover: (key) => { if (key) setSel(key); },
        onPinSelect: (key) => setSel(key),
        onFrame: ({ labels, hoverPiece }) => {
          const p = progress.current;
          const o = String(seg(p, 0.42, 0.48) * (1 - seg(p, 0.6, 0.66)));
          for (const b of BUTTONS) {
            const el = labelRefs.current[b.key];
            if (!el) continue;
            const l = labels.find((x) => x.key === b.key);
            el.style.opacity = l ? o : '0';
            if (l) el.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -100%)`;
            el.style.borderColor = hoverPiece === b.key ? '#f6d98b' : '#e2b24a';
            el.style.background = hoverPiece === b.key ? '#e2b24a' : 'rgba(10,18,53,.92)';
            el.style.color = hoverPiece === b.key ? '#0a1235' : '#efe9dc';
          }
        },
      });
    } catch {
      setNoGl(true);
      return;
    }
    worldRef.current = world;
    const ro = new ResizeObserver(() => world.resize(stage.clientWidth, stage.clientHeight));
    ro.observe(stage);
    world.resize(stage.clientWidth, stage.clientHeight);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? world.start() : world.stop()));
    io.observe(section);
    return () => { io.disconnect(); ro.disconnect(); world.dispose(); worldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { worldRef.current?.select(sel); }, [sel]);

  // scroll -> progress
  useEffect(() => {
    const apply = () => {
      const section = sectionRef.current;
      if (!section) return;
      const forced = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('story') : null;
      const p = forced !== null ? clamp(Number(forced)) : clamp(-section.getBoundingClientRect().top / SCROLL_PX);
      progress.current = p;
      worldRef.current?.setProgress(p);
      if (gateWrap.current) gateWrap.current.style.transform = `scale(${0.8 + 2.2 * ease(seg(p, 0, 0.46))})`;
      if (gateLayer.current) { gateLayer.current.style.opacity = String(1 - seg(p, 0.4, 0.5)); gateLayer.current.style.visibility = p > 0.52 ? 'hidden' : 'visible'; }
      const sx = 1 - 0.94 * ease(seg(p, 0.14, 0.38));
      leftLeaf.current?.setAttribute('transform', `translate(154 0) scale(${sx} 1) translate(-154 0)`);
      rightLeaf.current?.setAttribute('transform', `translate(486 0) scale(${sx} 1) translate(-486 0)`);
      if (intro.current) intro.current.style.opacity = String(1 - seg(p, 0.04, 0.14));
      if (hint.current) hint.current.style.opacity = String(1 - seg(p, 0, 0.04));
      if (holdHint.current) holdHint.current.style.opacity = String(seg(p, 0.44, 0.5) * (1 - seg(p, 0.58, 0.62)));
      if (card.current) { const o = seg(p, 0.9, 0.95); card.current.style.opacity = String(o); card.current.style.pointerEvents = o > 0.5 ? 'auto' : 'none'; }
      if (canvasWrap.current) canvasWrap.current.style.pointerEvents = (p > 0.42 && p < 0.64) || p > 0.9 ? 'auto' : 'none';
    };
    apply();
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply);
    return () => { window.removeEventListener('scroll', apply); window.removeEventListener('resize', apply); };
  }, []);

  const cur = CITY_DATA.find((c) => c.name === sel) ?? CITY_DATA[6];
  const cc = counts[cur.name] ?? { id: null, t: 0, c: 0, g: 0 };
  const total = cc.t + cc.c + cc.g;

  return (
    <section ref={sectionRef} id="story" style={{ position: 'relative', height: `calc(100vh + ${SCROLL_PX}px)` }}>
      <div ref={stageRef} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: '#0A1235' }}>
        <div ref={canvasWrap} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {/* gate: the doorway is a real hole, so the board shows through it */}
        <div ref={gateLayer} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div ref={gateWrap} style={{ height: 'min(88vh, 860px)', aspectRatio: '640 / 860', transformOrigin: '50% 62%', transform: 'scale(0.8)' }}>
            <GateSvg leftLeaf={leftLeaf} rightLeaf={rightLeaf} />
          </div>
        </div>

        <div ref={intro} style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', pointerEvents: 'none', color: '#EFE9DC' }}>
          <div style={{ fontFamily: kufi, fontSize: 26, fontWeight: 600 }}>قهوة شطرنج</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.75 }}>{t('Chess in Morocco')}</div>
        </div>
        <div ref={hint} style={{ position: 'absolute', left: 0, right: 0, bottom: 30, textAlign: 'center', pointerEvents: 'none', color: '#EFE9DC' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.7 }}>{t('Scroll')}</div>
          <div style={{ width: 1, height: 34, margin: '10px auto 0', background: '#E2B24A' }} />
        </div>
        <div ref={holdHint} style={{ position: 'absolute', left: 0, right: 0, bottom: 36, textAlign: 'center', pointerEvents: 'none', color: '#EFE9DC', opacity: 0, fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase' }}>
          {t('Click a piece, or keep scrolling')}
        </div>

        {BUTTONS.map((b) => (
          <div key={b.key} ref={(el) => { labelRefs.current[b.key] = el; }} style={{ position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'none', border: '1px solid #e2b24a', padding: '6px 14px', textAlign: 'center', whiteSpace: 'nowrap', background: 'rgba(10,18,53,.92)', color: '#efe9dc', transition: 'background .2s, color .2s' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{t(b.label)}</div>
            <div style={{ fontFamily: kufi, fontSize: 16 }}>{b.ar}</div>
          </div>
        ))}

        <div ref={card} style={{ position: 'absolute', right: 'max(24px, 5vw)', top: '50%', transform: 'translateY(-50%)', width: 330, opacity: 0, pointerEvents: 'none', color: '#EFE9DC' }}>
          <div style={{ fontFamily: kufi, fontSize: 24, fontWeight: 600, color: '#E2B24A' }}>الخريطة</div>
          <div style={{ margin: '4px 0 16px', fontSize: 12, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase' }}>{t('Map')}</div>
          <div style={{ border: '1px solid rgba(226,178,74,.55)', padding: '20px 22px', background: 'rgba(10,18,53,.82)' }}>
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

        {noGl && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EFE9DC' }}>{t('3D is not available in this browser.')}</div>}
      </div>
    </section>
  );
}

const btnStyle: React.CSSProperties = { border: '1px solid rgba(239,233,220,.4)', background: 'none', color: '#EFE9DC', font: '600 12px Inter, sans-serif', padding: '8px 14px', cursor: 'pointer' };

function GateSvg({ leftLeaf, rightLeaf }: { leftLeaf: React.RefObject<SVGGElement>; rightLeaf: React.RefObject<SVGGElement> }) {
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
        <g ref={leftLeaf}><rect x="154" y="170" width="166.5" height="640" fill="url(#g-brass)" /><rect x="154" y="170" width="166.5" height="640" fill="url(#g-sheen)" />{knocker(296)}</g>
        <g ref={rightLeaf}><rect x="319.5" y="170" width="166.5" height="640" fill="url(#g-brass)" /><rect x="319.5" y="170" width="166.5" height="640" fill="url(#g-sheen)" />{knocker(344)}</g>
      </g>
    </svg>
  );
}
