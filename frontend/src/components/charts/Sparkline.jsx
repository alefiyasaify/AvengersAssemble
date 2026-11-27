/** Small trend line (SVG) scaled to the min and max of `values`. */
export function Sparkline({ values, width = 120, height = 36, color = "#2563EB", area = false, label }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const points = values.map((v, i) => {
    const x = Math.round((i / Math.max(1, values.length - 1)) * width * 10) / 10;
    const y = Math.round((height - 4 - ((v - lo) / span) * (height - 8)) * 10) / 10;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ maxWidth: "100%" }}>
      {area ? <polygon points={`${points.join(" ")} ${width},${height} 0,${height}`} fill="rgba(255,255,255,.16)" /> : null}
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
