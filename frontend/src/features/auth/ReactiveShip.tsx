import { useEffect, useRef } from 'react';
import './reactive-ship.css';

export type LightLevel = 'on' | 'hot' | 'off';

/** Deck light x positions (viewBox units), stern to bow. */
const DECK_LIGHTS = [282, 326, 370, 414, 458, 502, 546, 590, 634, 678];
export const DECK_LIGHT_COUNT = DECK_LIGHTS.length;
/** Reflection columns: x and sway offset in seconds (unsynchronised, from the design). */
const REFLECTIONS = [[276, 0], [320, -1.8], [364, -2.6], [408, -3.4], [452, -0.9], [496, -2.1], [540, -3.9], [584, -1.2], [628, -2.9], [672, -0.2]];
const STARS = [[120, 60, 1, ''], [330, 96, 1, 't2'], [520, 42, 1.2, 't3'], [690, 88, 1, ''], [900, 52, 1.2, 't2'], [1060, 120, 1, 't3'],
  [1220, 64, 1, ''], [1370, 128, 1.2, 't2'], [620, 300, 1, 't3'], [420, 380, 1, '']] as const;

/**
 * Dusk scene for the sign-in and sign-up pages (design: docs/ui-revamp/assets/inspo/sign-in-page,
 * "Login — hybrid, reactive ship"). Decorative: the lights mirror the form beside it.
 * Illustration colours are artwork, kept here rather than as UI tokens.
 */
export function ReactiveShip({ levels, bridge, dim = false, sail = false, paused = false }: {
  levels: LightLevel[]; bridge: LightLevel; dim?: boolean; sail?: boolean; paused?: boolean;
}) {
  const cls = ['rship', dim && 'dim', sail && 'go', paused && 'paused'].filter(Boolean).join(' ');
  const svg = useRef<SVGSVGElement>(null);

  // Reflection sway at 8 updates/s instead of a 60fps CSS animation (see reactive-ship.css). Off when hidden or reduced motion.
  useEffect(() => {
    const columns = [...(svg.current?.querySelectorAll<SVGElement>('.rf') ?? [])];
    if (paused || !columns.length || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const sway = () => {
      const t = performance.now() / 1000;
      for (const column of columns) {
        const offset = Number(column.dataset.sway ?? 0);
        column.style.transform = `translateX(${(-3 * Math.cos((2 * Math.PI * (t + offset)) / 9)).toFixed(2)}px)`;
      }
    };
    sway();
    const timer = window.setInterval(sway, 125);
    return () => window.clearInterval(timer);
  }, [paused]);

  return <svg ref={svg} className={cls} data-reactive-ship viewBox="0 0 1440 900" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="hSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b0c0e" /><stop offset=".55" stopColor="#121317" /><stop offset=".85" stopColor="#1f1b18" /><stop offset="1" stopColor="#33281c" /></linearGradient>
      <linearGradient id="hSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2218" /><stop offset=".22" stopColor="#141416" /><stop offset="1" stopColor="#0a0b0c" /></linearGradient>
      <radialGradient id="hMoon" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#eadfc9" stopOpacity=".22" /><stop offset=".4" stopColor="#eadfc9" stopOpacity=".07" /><stop offset="1" stopColor="#eadfc9" stopOpacity="0" /></radialGradient>
      <linearGradient id="hFadeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".6" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <mask id="hFade"><rect x="0" y="0" width="1" height="1" fill="url(#hFadeGrad)" /></mask>
      <pattern id="hDash" width="14" height="14" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="10" height="2" fill="#eadfc9" /><rect x="5" y="7" width="9" height="2" fill="#eadfc9" /></pattern>
      <filter id="hBlur6" x="-60%" y="-200%" width="220%" height="500%"><feGaussianBlur stdDeviation="6" /></filter>
      <filter id="hBlur3" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3" /></filter>
      <mask id="hRouteMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900"><path className="draw" d="M722 644 Q 784 634 846 632" stroke="#fff" strokeWidth="8" fill="none" pathLength="100" /></mask>
      <g id="hRf"><rect x="0" y="0" width="12" height="70" fill="url(#hDash)" mask="url(#hFade)" /></g>
    </defs>

    <rect x="0" y="0" width="1440" height="640" fill="url(#hSky)" />
    <g fill="#f0e6d2">{STARS.map(([cx, cy, r, t]) => <circle key={`${cx}-${cy}`} className={`twinkle ${t}`} cx={cx} cy={cy} r={r} />)}</g>
    <circle cx="790" cy="190" r="150" fill="url(#hMoon)" />
    <circle cx="790" cy="190" r="20" fill="#efe5d1" opacity=".92" />

    <rect x="0" y="640" width="1440" height="260" fill="url(#hSea)" />
    <line x1="0" y1="640.5" x2="1440" y2="640.5" stroke="#4a3c29" strokeOpacity=".8" />
    <rect className="rf" data-sway="-1" x="772" y="642" width="36" height="230" fill="url(#hDash)" mask="url(#hFade)" opacity=".45" />
    <path d="M60 690H300M480 712H760M200 760H620M900 740H1260M80 820H420" stroke="#eadfc9" strokeOpacity=".05" />

    <path d="M722 644 Q 784 634 846 632" stroke="#eadfc9" strokeWidth="1.6" strokeDasharray="3 6" fill="none" mask="url(#hRouteMask)" />
    <g className="wp">
      <circle className="wpring" cx="850" cy="632" r="6" fill="none" stroke="#eadfc9" strokeWidth="1.2" />
      <circle cx="850" cy="632" r="3" fill="#eadfc9" />
    </g>

    <g transform="translate(-90 378) scale(1.1)">
      <g className="sail">
        <g className="refl">
          <rect className="rf" data-sway="-2.4" x="172" y="240" width="58" height="90" fill="url(#hDash)" mask="url(#hFade)" />
          {REFLECTIONS.map(([x, offset]) => <use key={x} className="rf" data-sway={offset} href="#hRf" x={x} y="240" />)}
        </g>
        <path className="wake" d="M118 234 L-40 222 M118 238 L-50 252 M676 238 L560 246" stroke="#eadfc9" strokeOpacity=".3" strokeWidth="1.5" fill="none" />

        <g className="bob">
          <path d="M182 130L188 84H212L218 130Z" fill="#1f2328" />
          <rect x="186" y="80" width="28" height="4" fill="#2a2e34" />
          <rect x="187" y="100" width="26" height="2" fill="#eadfc9" opacity=".5" />
          <path d="M188 84L182 130" stroke="#8a7d66" strokeOpacity=".5" />

          <path d="M118 198H706L734 188L676 238H118Z" fill="#1b1e23" />
          <path d="M118 220H690L676 238H118Z" fill="#15171b" />
          <path d="M118 198H706L734 188" fill="none" stroke="#8a7d66" strokeOpacity=".7" strokeWidth="1.2" />
          <path className="deckglow" d="M118 237.5H676" stroke="#eadfc9" strokeWidth="1" />

          <rect x="146" y="160" width="108" height="38" fill="#20242a" />
          <rect x="158" y="130" width="84" height="30" fill="#23272d" />
          <rect x="166" y="108" width="68" height="22" fill="#262b31" />
          <rect x="160" y="124" width="80" height="3" fill="#2d3239" />
          <path d="M146 160.5H254M158 130.5H242M166 108.5H234" stroke="#8a7d66" strokeOpacity=".55" />

          <path d="M200 108V56M192 70H208" stroke="#3a3f46" strokeWidth="2" />
          <circle cx="200" cy="56" r="7" fill="#eadfc9" opacity=".35" filter="url(#hBlur3)" />
          <circle cx="200" cy="56" r="2" fill="#eadfc9" />

          <g className={`bridge ${bridge}`} data-level={bridge}>
            <rect className="bglow" x="166" y="104" width="68" height="26" fill="#eadfc9" filter="url(#hBlur6)" />
            <g fill="#eadfc9">{[174, 184, 194, 204, 214, 224].map(x => <rect key={x} x={x} y="114" width="6" height="5" />)}</g>
          </g>
          <g fill="#eadfc9" opacity=".85">
            <rect x="168" y="141" width="5" height="5" /><rect x="180" y="141" width="5" height="5" /><rect className="w1" x="204" y="141" width="5" height="5" /><rect x="216" y="141" width="5" height="5" />
            <rect className="w2" x="156" y="173" width="5" height="5" /><rect x="180" y="173" width="5" height="5" /><rect x="216" y="173" width="5" height="5" /><rect className="w1" x="240" y="173" width="5" height="5" />
          </g>

          <path d="M262 192H700" stroke="#2a2e34" strokeWidth="3" />
          <rect x="436" y="182" width="48" height="16" fill="#20242a" />
          <path d="M436 182.5H484" stroke="#8a7d66" strokeOpacity=".45" />
          <path d="M300 198V192M350 198V192M400 198V192M540 198V192M600 198V192M650 198V192" stroke="#2a2e34" strokeWidth="2" />
          <path d="M520 198V158L574 176" fill="none" stroke="#3a3f46" strokeWidth="2" />
          <rect x="640" y="176" width="52" height="22" fill="#20242a" />
          <path d="M640 176.5H692" stroke="#8a7d66" strokeOpacity=".45" />
          <path d="M690 176V164M684 168H696" stroke="#3a3f46" strokeWidth="2" />
          <circle cx="690" cy="164" r="2" fill="#eadfc9" />

          <path d="M282 198V190M326 198V190M370 198V190M414 198V190M458 198V190M502 198V190M546 198V190M590 198V190M634 198V190M678 198V190" stroke="#3a3f46" strokeWidth="1.4" />
          <g fill="#eadfc9">
            {DECK_LIGHTS.map((cx, i) => <g key={cx} data-deck-light={levels[i] ?? 'on'}>
              <circle className={`hl ${levels[i] ?? 'on'}`} cx={cx} cy="189" r="6" filter="url(#hBlur3)" />
              <circle className={`lt ${levels[i] ?? 'on'}`} cx={cx} cy="189" r="2" />
            </g>)}
          </g>
        </g>
      </g>
    </g>
  </svg>;
}
