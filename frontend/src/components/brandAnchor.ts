/** Shared geometry for the website and recommendation PDF. Coordinates start at the top left. */
export const brandAnchor = {
  viewBoxSize: 24,
  strokeWidth: 1.8,
  ring: { cx: 12, cy: 4, radius: 2 },
  path: [
    ['M', 12, 6], ['L', 12, 21],
    ['M', 7, 10], ['L', 17, 10],
    ['M', 4, 13], ['L', 4, 16],
    ['C', 4, 19, 12, 21, 12, 21],
    ['C', 12, 21, 20, 19, 20, 16], ['L', 20, 13],
    ['M', 2, 15], ['L', 4, 13], ['L', 6, 15],
    ['M', 18, 15], ['L', 20, 13], ['L', 22, 15],
  ],
} as const;
