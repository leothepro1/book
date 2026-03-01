"use client";

export default function CountdownRing({
  value,
  total,
  size = 26,
  stroke = 2.5,
  className,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const clamped = Math.max(0, Math.min(total, value));
  const progress = clamped / total; // 1 -> 0
  const dashoffset = c * (1 - progress);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{
        display: "block",
        transform: "rotate(-90deg) scaleX(-1)", // reverse clockwise
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.22}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={dashoffset}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}
