"use client";

/**
 * The signature element: a 240° instrument gauge, needle at the score.
 *
 * The number used to count up from zero in a `requestAnimationFrame` loop.
 * That worked while the report arrived by client-side fetch — the gauge mounted
 * before the score existed. Now that `/report` server-renders the audit, the
 * score is in the served HTML, and a count-up could only produce one of two
 * wrong things: a gauge reading `0` for a visitor without JavaScript, or a
 * visible snap back to `0` on hydration for everyone else. The gauge shows the
 * real number on first paint instead; arrival motion is the panel's `rise`.
 */
export function ScoreGauge({ score, grade, coverage }: { score: number | null; grade: string | null; coverage: number }) {
  const shown = score ?? 0;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 92;
  const startAngle = -210; // degrees, 0 = 3 o'clock
  const sweep = 240;
  const angle = startAngle + (sweep * shown) / 100;

  const polar = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const arc = (from: number, to: number, radius: number) => {
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  const ticks = Array.from({ length: 25 }, (_, i) => {
    const a = startAngle + (sweep * i) / 24;
    const major = i % 6 === 0;
    const [x1, y1] = polar(a, r + 10);
    const [x2, y2] = polar(a, r + (major ? 22 : 16));
    return { x1, y1, x2, y2, major, label: major ? String((i / 24) * 100) : null, lx: polar(a, r + 34)[0], ly: polar(a, r + 34)[1] };
  });

  const [nx, ny] = polar(angle, r - 4);
  const [tx, ty] = polar(angle + 180, 18);
  const colour = score === null ? "var(--text-faint)" : score >= 75 ? "var(--pass)" : score >= 40 ? "var(--signal)" : "var(--fail)";

  return (
    <figure className="relative w-[240px] h-[240px] shrink-0 mx-auto" aria-label={score === null ? "No score" : `Score ${score} out of 100, grade ${grade}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className="overflow-visible">
        <path d={arc(startAngle, startAngle + sweep, r)} fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        {shown > 0 && (
          <path d={arc(startAngle, angle, r)} fill="none" stroke={colour} strokeWidth="4" strokeLinecap="round" />
        )}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? "var(--text-muted)" : "var(--line-strong)"} strokeWidth={t.major ? 1.5 : 1} />
            {t.label && (
              <text x={t.lx} y={t.ly} fontSize="9" fill="var(--text-faint)" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-geist-mono)">
                {t.label}
              </text>
            )}
          </g>
        ))}
        {/* needle */}
        <line x1={tx} y1={ty} x2={nx} y2={ny} stroke={colour} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--bg)" stroke={colour} strokeWidth="2" />
      </svg>
      <figcaption className="absolute inset-x-0 top-[58%] text-center">
        <div className="display font-mono text-4xl font-semibold tabular leading-none" style={{ color: colour }}>
          {score === null ? "—" : shown}
        </div>
        <div className="mt-1 font-mono text-xs text-muted">
          {grade ? (
            <>
              grade <span className="text-text font-semibold">{grade}</span> · {Math.round(coverage * 100)}% coverage
            </>
          ) : (
            "no score"
          )}
        </div>
      </figcaption>
    </figure>
  );
}
