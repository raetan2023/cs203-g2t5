import { brandAnchor } from './brandAnchor';

const anchorPath = brandAnchor.path.map(command => command.join(' ')).join(' ');

/** The Bunker Buddy logo mark (anchor in a beige circle), shared by the app header and the sign-in form. */
export function BrandMark() {
  const { viewBoxSize, strokeWidth, ring } = brandAnchor;
  return <span className="bb-brand-mark">
    <svg width="20" height="20" viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={ring.cx} cy={ring.cy} r={ring.radius} /><path d={anchorPath} />
    </svg>
  </span>;
}

export function Brand() {
  return <span className="bb-brand"><BrandMark /><span>Bunker Buddy</span></span>;
}
