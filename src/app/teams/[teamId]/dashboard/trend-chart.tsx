/**
 * SVG-based line chart for trend visualisation.
 * Requirements: 8.1, 8.2; Manager Experience 3.1, 3.2, 3.3, 3.4
 *
 * Y-axis fixed 1.0–5.0, sessions on X-axis chronologically.
 * One line per question across closed sessions.
 *
 * The drawing is accompanied by two things it cannot provide on its own:
 *
 * - a **legend** naming each question beside its colour, because five lines
 *   distinguished only by hue are unreadable to anyone with a colour vision
 *   deficiency, and unprintable in greyscale
 * - a **data table** carrying every plotted value, because `role="img"` hides
 *   the SVG's contents from assistive technology. Making the points
 *   individually focusable would mean dropping that role and hand-building a
 *   widget; a table is the standard answer and needs no invention.
 *
 * Requirement 3.3 asks for the values to be available without a pointer, which
 * the table satisfies for every user rather than only for those who can hover.
 */

import { pluralise } from '@/lib/format';
import { sessionPositions } from './chart-geometry';

interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

interface SessionData {
  sessionId: string;
  closedAt: string;
  averages: SessionAverage[];
}

interface TrendChartProps {
  sessions: SessionData[];
}

/**
 * Shared by the figure and the table, so both are described by the same
 * sentence and a screen reader hears one caption rather than two.
 */
const CAPTION_ID = 'trend-chart-caption';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 20;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 40;

const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const Y_MIN = 1.0;
const Y_MAX = 5.0;

const LINE_COLOURS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
];

function scoreToY(score: number): number {
  const ratio = (score - Y_MIN) / (Y_MAX - Y_MIN);
  return PADDING_TOP + PLOT_HEIGHT * (1 - ratio);
}

/**
 * Sessions are positioned by when they closed, not by their turn in the list.
 * See `chart-geometry.ts` — the mapping lives there so it can be exercised
 * without rendering, including the single-session and identical-dates cases.
 */

/** Converts a question ID like "q-delivering-value" to "Delivering Value". */
function questionName(id: string): string {
  return id
    .replace(/^q-/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Formats a session's close date as "1 August 2026". */
function fullDate(isoString: string): string {
  // Locale pinned deliberately: leaving it to the runtime renders differently
  // on a British machine and on CI
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TrendChart({ sessions }: TrendChartProps) {
  // Collect all unique question IDs across sessions
  const questionIds = Array.from(
    new Set(sessions.flatMap((s) => s.averages.map((a) => a.questionId)))
  );

    // Horizontal position per session, proportional to elapsed time
  const xBySession = sessionPositions(sessions.map(session => session.closedAt));

  // Build lines: one polyline per question
  const lines = questionIds.map((qId, qIndex) => {
    const points: string[] = [];

    sessions.forEach((session, sIndex) => {
      const avg = session.averages.find((a) => a.questionId === qId);
      if (avg) {
        const x = xBySession[sIndex];
        const y = scoreToY(avg.averageScore);
        points.push(`${x},${y}`);
      }
    });

    return {
      questionId: qId,
      colour: LINE_COLOURS[qIndex % LINE_COLOURS.length],
      points: points.join(' '),
    };
  });

  // Y-axis labels (1.0, 2.0, 3.0, 4.0, 5.0)
  const yLabels = [1, 2, 3, 4, 5];

  // X-axis labels (session dates)
  const xLabels = sessions.map((s, i) => ({
    label: formatDate(s.closedAt),
    x: xBySession[i],
  }));

  const caption = `Average score per question across the last ${pluralise(
    sessions.length,
    'closed session',
  )}`;

  return (
    <figure aria-labelledby={CAPTION_ID} className="m-0">
      <figcaption id={CAPTION_ID} className="mb-3 text-sm text-gray-700">
        {caption}. Scores run from 1 to 5, and sessions are spaced by the time
        between them, so the slope of a line reflects how quickly a score moved.
      </figcaption>

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
      {/* Y-axis grid lines and labels */}
      {yLabels.map((val) => {
        const y = scoreToY(val);
        return (
          <g key={val}>
            <line
              x1={PADDING_LEFT}
              y1={y}
              x2={CHART_WIDTH - PADDING_RIGHT}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth="1"
            />
            <text
              x={PADDING_LEFT - 10}
              y={y + 4}
              textAnchor="end"
              className="text-xs"
              fill="#6B7280"
              fontSize="12"
            >
              {val.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {xLabels.map((item, i) => (
        <text
          key={i}
          x={item.x}
          y={CHART_HEIGHT - 10}
          textAnchor="middle"
          fill="#6B7280"
          fontSize="10"
        >
          {item.label}
        </text>
      ))}

      {/* Trend lines */}
      {lines.map((line) => (
        <polyline
          key={line.questionId}
          points={line.points}
          fill="none"
          stroke={line.colour}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Data points */}
      {lines.map((line) =>
        line.points.split(' ').map((point, i) => {
          const [cx, cy] = point.split(',');
          return (
            <circle
              key={`${line.questionId}-${i}`}
              cx={cx}
              cy={cy}
              r="4"
              fill={line.colour}
            />
          );
        })
      )}
      </svg>

      {/*
        The legend carries each question's name beside its colour, so the lines
        are identified by something other than hue.
      */}
      <ul aria-label="Questions plotted" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {lines.map((line) => (
          <li key={line.questionId} className="flex items-center gap-2 text-gray-700">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: line.colour }}
            />
            {questionName(line.questionId)}
          </li>
        ))}
      </ul>

      {/*
        Every plotted value, for anyone who cannot read the drawing. Kept in the
        page rather than behind a disclosure: a table hidden by default is one
        more thing to discover, and this one is small.
      */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm" aria-labelledby={CAPTION_ID}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium text-gray-700">
                Session closed
              </th>
              {questionIds.map((questionId) => (
                <th key={questionId} scope="col" className="py-1 pr-4 font-medium text-gray-700">
                  {questionName(questionId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId} className="border-t border-gray-200">
                <th scope="row" className="py-1 pr-4 font-normal text-gray-700">
                  {fullDate(session.closedAt)}
                </th>
                {questionIds.map((questionId) => {
                  const average = session.averages.find((a) => a.questionId === questionId);
                  return (
                    <td key={questionId} className="py-1 pr-4 text-gray-600">
                      {average
                        ? `${average.averageScore.toFixed(1)} from ${pluralise(
                            average.responseCount,
                            'response',
                          )}`
                        : 'Not answered'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Formats an ISO date string to a short date like "Jan 8" */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
