import { Icon } from '../features/purchase-plan/components/Primitives';

/** The Bunker Buddy logo mark (anchor in a beige circle), shared by the app header and the sign-in form. */
export function BrandMark() {
  return <span className="bb-brand-mark"><Icon name="anchor" /></span>;
}

export function Brand() {
  return <span className="bb-brand"><BrandMark /><span>Bunker Buddy</span></span>;
}
