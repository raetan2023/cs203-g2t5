import { useId, type CSSProperties } from 'react';
import { OrisLogin } from '../oris/OrisLogin';

type Point = [number, number, number];
// Orthographic projection keeps the mesh crisp at every viewport size.
const project = ([x, y, z]: Point) => `${(450 + x * 1.23 + z * .7).toFixed(2)},${(275 - y * .92 - x * .28 + z * .42).toFixed(2)}`;
const line = (points: Point[], close = false) => `M${points.map(project).join('L')}${close ? 'Z' : ''}`;
const beam = (x: number) => 62 * Math.pow(Math.sin(Math.PI * (x + 276) / 562), .38);
const stations = Array.from({ length: 37 }, (_, i) => -270 + i * (550 / 36));
const hullPoint = (x: number, level: number): Point => {
  const angle = Math.PI * level / 20;
  const depth = Math.pow(Math.sin(angle), .55) * 96;
  // A raked stem pulls the lower bow inward; no projecting bulb below it.
  const rake = Math.max(0, (x - 190) / 90) * depth * .48;
  const width = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), .55) * beam(x);
  return [x - rake, 34 - depth, width];
};
const outline = [line(stations.map(x => hullPoint(x, 10))), line([
  ...stations.map(x => hullPoint(x, 0)), ...stations.slice().reverse().map(x => hullPoint(x, 20)),
], true)];
const hull: string[] = [];
const deck: string[] = [];
const structure: string[] = [];
let paths = hull;
for (const x of stations) paths.push(line(Array.from({ length: 21 }, (_, i) => hullPoint(x, i)), true));
for (let level = 0; level <= 20; level++) paths.push(line(stations.map(x => hullPoint(x, level))));
paths = deck;
for (let z = -48; z <= 48; z += 12) paths.push(line(stations.filter(x => beam(x) > Math.abs(z)).map(x => [x, 34, z])));
function box(x: number, y: number, z: number, length: number, height: number, width: number) {
  const bottom: Point[] = [[x,y,z],[x+length,y,z],[x+length,y,z+width],[x,y,z+width]];
  const top = bottom.map(([a,b,c]): Point => [a,b+height,c]);
  paths.push(line(bottom,true),line(top,true));
  bottom.forEach((p,i) => paths.push(line([p,top[i]])));
}
// Broad aft bridge and mast rise above the container stacks.
paths = structure;
box(-225,34,-44,62,83,88);
box(-237,117,-56,85,17,112);
box(-211,134,-32,46,11,64);
box(-248,34,-22,18,100,33);
for (let y = 52; y < 117; y += 16) paths.push(line([[-225,y,-44],[-163,y,-44],[-163,y,44]]));
for (let x = -230; x < -157; x += 10) box(x,121,-56,6,8,1);
paths.push(line([[-186,145,0],[-186,192,0]]),line([[-200,173,0],[-172,173,0]]));
// Staggered container bays leave an open working foredeck at the bow.
paths = deck;
for (let bay = 0; bay < 7; bay++) {
  const x = -150 + bay * 45;
  for (let row = 0; row < 4; row++) {
    const z = -44 + row * 22;
    const tiers = bay === 6 ? 3 : (bay + row) % 3 === 0 ? 3 : 4;
    // Draw only the outside edges of each stack, with horizontal tier seams.
    box(x,34,z,42,tiers*19,20);
    for (let tier = 1; tier < tiers; tier++) paths.push(line([
      [x,34+tier*19,z],[x+42,34+tier*19,z],
      [x+42,34+tier*19,z+20],[x,34+tier*19,z+20],
    ],true));
  }
}
box(200,34,-22,18,11,14);
box(225,34,14,16,9,12);
paths.push(line([[194,34,0],[194,108,0]]),line([[177,34,0],[194,83,0],[210,34,0]]));
for (const side of [-1,1]) {
  paths.push(line(stations.map(x => [x,44,side * beam(x)])));
  stations.filter((_,i) => i % 2 === 0).forEach(x => paths.push(line([[x,34,side*beam(x)],[x,44,side*beam(x)]])));
}
const stages = [
  { name: 'outline', paths: outline, start: 0, stagger: .12, duration: .8 },
  { name: 'hull', paths: hull, start: .45, stagger: .017, duration: .8 },
  { name: 'deck', paths: deck, start: 1.65, stagger: .7 / deck.length, duration: .7 },
  { name: 'structure', paths: structure, start: 2.35, stagger: .009, duration: .75 },
];
const mesh = stages.flatMap(stage => stage.paths).join('');

function WireframeBackground() {
  const id = useId().replace(/:/g, '');
  return <div className="wireframe-scene" aria-hidden="true">
    <svg className="wireframe-vessel" data-wireframe-vessel viewBox="75 50 750 370" fill="none" focusable="false">
      <defs>
        <path id={`${id}-mesh`} d={mesh} />
        <linearGradient id={`${id}-glow`}><stop stopColor="white" stopOpacity="0" /><stop offset=".5" stopColor="white" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
        <mask id={`${id}-light`} maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="440"><rect className="wireframe-sweep" x="-180" y="0" width="180" height="440" fill={`url(#${id}-glow)`} /></mask>
      </defs>
      <g stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
        {stages.map(stage => <g key={stage.name} opacity={stage.name === 'outline' ? .65 : .48} strokeWidth={stage.name === 'outline' ? .85 : .65}>
          {stage.paths.map((d, index) => <path key={index} className="wireframe-build" d={d} pathLength="1" style={{
            '--build-delay': `${(stage.start + index * stage.stagger).toFixed(3)}s`,
            '--build-duration': `${stage.duration}s`,
          } as CSSProperties} />)}
        </g>)}
        <use className="wireframe-highlight" href={`#${id}-mesh`} strokeWidth="1" opacity=".55" mask={`url(#${id}-light)`} />
      </g>
    </svg>
  </div>;
}

export function WireframeLogin() {
  return <OrisLogin className="wireframe-theme" background={<></>} introVisual={<WireframeBackground />} />;
}
