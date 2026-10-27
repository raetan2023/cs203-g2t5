import { OrisLogin } from '../oris/OrisLogin';
import { WireframeVessel } from '../../features/auth/WireframeVessel';

export function WireframeLogin() {
  return <OrisLogin className="wireframe-theme" background={<></>} introVisual={<WireframeVessel />} />;
}
