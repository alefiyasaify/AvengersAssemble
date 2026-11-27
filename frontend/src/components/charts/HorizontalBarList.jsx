/**
 * List of labelled horizontal bars, sized relative to the largest value.
 * rows: [label, value][] (straight from the API response).
 */
export function HorizontalBarList({ rows, color = "#2563EB", format = (v) => v.toFixed(1), unit = "" }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([label, value]) => (
        <div key={label} className="hbar" role="img" aria-label={`${label}, ${format(value)}${unit ? ` ${unit}` : ""}`}>
          <span>{label}</span>
          <span className="track">
            <span style={{ width: `${Math.round((value / max) * 100)}%`, background: color }} />
          </span>
          <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>
            {format(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
