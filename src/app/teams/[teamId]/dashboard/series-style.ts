/**
 * How each question theme's line is distinguished from the others.
 * Requirements: Dashboard Refinement 2.1, 2.2, 2.3, 2.5
 *
 * Colour alone was not enough: blue and purple were reported as hard to tell
 * apart on an ordinary screen, before ever reaching greyscale printing or a
 * reader with a colour vision deficiency.
 *
 * Each series therefore carries three attributes — colour, dash pattern and
 * marker shape — of which two survive colour being removed entirely. Dashes
 * read at a glance across a long line; marker shapes stay legible where a line
 * is short or steep and the dash pattern has no room to repeat. Either alone is
 * fragile, so both are used.
 */

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';

export interface SeriesStyle {
  colour: string;
  /** SVG stroke-dasharray; an empty string draws a solid line. */
  dash: string;
  marker: MarkerShape;
}

/**
 * Five styles for five fixed question themes.
 *
 * No two share both a dash and a marker, which is what Property 3 asserts. The
 * colours remain, but nothing depends on them.
 */
const SERIES_STYLES: SeriesStyle[] = [
  { colour: '#1D4ED8', dash: '', marker: 'circle' },
  { colour: '#047857', dash: '6 3', marker: 'square' },
  { colour: '#B45309', dash: '1 3', marker: 'triangle' },
  { colour: '#BE123C', dash: '8 3 2 3', marker: 'diamond' },
  { colour: '#6D28D9', dash: '12 4', marker: 'cross' },
];

/** The style for the series at this position, wrapping if there are ever more. */
export function seriesStyle(index: number): SeriesStyle {
  return SERIES_STYLES[index % SERIES_STYLES.length];
}

/** How many distinct styles exist before they repeat. */
export const SERIES_STYLE_COUNT = SERIES_STYLES.length;

/**
 * Draws a marker as an SVG path centred on a point.
 *
 * Shapes rather than a single circle so the series can be told apart where the
 * line itself is too short to show its dash pattern.
 */
export function markerPath(marker: MarkerShape, cx: number, cy: number, r = 4): string {
  switch (marker) {
    case 'square':
      return `M ${cx - r} ${cy - r} h ${r * 2} v ${r * 2} h ${-r * 2} Z`;
    case 'triangle':
      return `M ${cx} ${cy - r} L ${cx + r} ${cy + r} L ${cx - r} ${cy + r} Z`;
    case 'diamond':
      return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
    case 'cross':
      return `M ${cx - r} ${cy - r} L ${cx + r} ${cy + r} M ${cx + r} ${cy - r} L ${cx - r} ${cy + r}`;
    case 'circle':
    default:
      // Two arcs, so every marker is one path element and the renderer needs no
      // special case for circles
      return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
  }
}
