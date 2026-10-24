import { useId } from 'react';
import { OrisLogin } from '../oris/OrisLogin';

type Point = [number, number, number];
// Orthographic projection keeps the mesh crisp at every viewport size.
const project = ([x, y, z]: Point) => `${(450 + x * 1.23 + z * .7).toFixed(2)},${(275 - y * .92 - x * .28 + z * .42).toFixed(2)}`;
const line = (points: Point[], close = false) => `M${points.map(project).join('L')}${close ? 'Z' : ''}`;
const beam = (x: number) => 62 * Math.pow(Math.sin(Math.PI * (x + 276) / 562), .38);
const stations = Array.from({ length: 45 }, (_, i) => -270 + i * 12.5);
const hullPoint = (x: number, level: number): Point => {
  const angle = Math.PI * level / 12;
  return [x, 34 - Math.sin(angle) * 83, Math.cos(angle) * beam(x)];
};
const paths: string[] = [];
for (const x of stations) paths.push(line(Array.from({ length: 13 }, (_, i) => hullPoint(x, i)), true));
for (let level = 0; level <= 12; level++) paths.push(line(stations.map(x => hullPoint(x, level))));
for (let z = -48; z <= 48; z += 12) paths.push(line(stations.filter(x => beam(x) > Math.abs(z)).map(x => [x, 34, z])));
function box(x: number, y: number, z: number, length: number, height: number, width: number) {
  const bottom: Point[] = [[x,y,z],[x+length,y,z],[x+length,y,z+width],[x,y,z+width]];
  const top = bottom.map(([a,b,c]): Point => [a,b+height,c]);
  paths.push(line(bottom,true),line(top,true));
  bottom.forEach((p,i) => paths.push(line([p,top[i]])));
}
// Aft accommodation, bridge, funnel and mast distinguish a tanker from a cargo ship.
box(-225,34,-44,72,56,88);
box(-231,90,-51,80,22,102);
box(-211,112,-32,46,13,64);
box(-244,34,-22,18,80,33);
for (let y = 48; y < 110; y += 14) paths.push(line([[-225,y,-44],[-153,y,-44],[-153,y,44]]));
for (let x = -222; x < -157; x += 11) box(x,96,-51,7,9,1);
paths.push(line([[-186,125,0],[-186,181,0]]),line([[-200,160,0],[-172,160,0]]));
// Deck pipes, manifolds, tank hatches and perimeter rails.
for (const z of [-30,-20,20,30]) {
  paths.push(line([[-145,39,z],[220,39,z],[230,34,z]]));
  paths.push(line([[-145,42,z],[220,42,z],[230,34,z]]));
}
for (let x = -115; x < 210; x += 48) {
  box(x,34,-10,21,8,20);
  paths.push(line([[x,34,-42],[x,50,-42],[x,50,42],[x,34,42]]));
}
for (const side of [-1,1]) {
  paths.push(line(stations.map(x => [x,44,side * beam(x)])));
  stations.filter((_,i) => i % 2 === 0).forEach(x => paths.push(line([[x,34,side*beam(x)],[x,44,side*beam(x)]])));
}
const mesh = paths.join('');

function WireframeBackground() {
  const id = useId().replace(/:/g, '');
  return <div className="wireframe-scene" aria-hidden="true">
    <svg className="wireframe-vessel" data-wireframe-vessel viewBox="0 0 900 440" fill="none" focusable="false">
      <defs>
        <path id={`${id}-mesh`} d={mesh} />
        <clipPath id={`${id}-light`}><rect className="wireframe-sweep" x="-180" y="0" width="140" height="440" /></clipPath>
      </defs>
      <g className="wireframe-drift">
        <use href={`#${id}-mesh`} stroke="currentColor" strokeWidth=".65" opacity=".48" />
        <use className="wireframe-highlight" href={`#${id}-mesh`} stroke="currentColor" strokeWidth="1" opacity=".65" clipPath={`url(#${id}-light)`} />
      </g>
    </svg>
  </div>;
}

export function WireframeLogin() {
  return <OrisLogin className="wireframe-theme" background={<WireframeBackground />} />;
}
