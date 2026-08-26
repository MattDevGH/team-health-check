/**
 * SVG-based line chart for trend visualisation.
 * Requirements: 8.1, 8.2
 *
 * Y-axis fixed 1.0–5.0, sessions on X-axis chronologically.
 * One line per question across closed sessions.
 */

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

const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 20;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 40;

const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
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

function sessionToX(index: number, total: number): number {
  if (total <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
  return PADDING_LEFT + (index / (total - 1)) * PLOT_WIDTH;
}

export function TrendChart({ sessions }: TrendChartProps) {
  // Collect all unique question IDs across sessions
  const questionIds = Array.from(
    new Set(sessions.flatMap((s) => s.averages.map((a) => a.questionId)))
  );

  const sessionCount = sessions.length;

  // Build lines: one polyline per question
  const lines = questionIds.map((qId, qIndex) => {
    const points: string[] = [];

    sessions.forEach((session, sIndex) => {
      const avg = session.averages.find((a) => a.questionId === qId);
      if (avg) {
        const x = sessionToX(sIndex, sessionCount);
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
    x: sessionToX(i, sessionCount),
  }));

  return (
    <svg
      role="img"
      aria-label="Trend chart"
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
  );
}

/** Formats an ISO date string to a short date like "Jan 8" */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
