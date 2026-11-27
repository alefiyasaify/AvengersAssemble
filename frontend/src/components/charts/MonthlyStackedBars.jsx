import { Empty } from "antd";
import dayjs from "dayjs";

export const CATEGORY_COLORS = ["#1E3A8A", "#2563EB", "#60A5FA", "#BFDBFE", "#F2A33A", "#94A3B8"];

/** Every "YYYY-MM" from `from` to `to` (inclusive), so months with no spend still get a bar. */
export function monthsBetween(from, to) {
  const months = [];
  let cursor = dayjs(from).startOf("month");
  const end = dayjs(to).startOf("month");
  while (!cursor.isAfter(end)) {
    months.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return months;
}

/**
 * Stacked monthly bars from DashboardSummary.spend_by_month rows ({ month, category, amount_paise }).
 * months: the "YYYY-MM" list to show (use monthsBetween to include empty months).
 * format: paise → label above each bar.
 */
export function MonthlyStackedBars({ rows, months, categoryName = (c) => c, format, height = 260 }) {
  const categories = [...new Set(rows.map((r) => r.category))];
  const bars = months.map((month) => {
    const values = categories.map((c) => rows.filter((r) => r.month === month && r.category === c).reduce((s, r) => s + r.amount_paise, 0));
    return { month, label: dayjs(`${month}-01`).format("MMM"), values, total: values.reduce((a, b) => a + b, 0) };
  });
  if (!bars.some((b) => b.total)) return <Empty description="No spend in this period" />;
  const max = Math.max(...bars.map((b) => b.total));
  const barArea = height - 60;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "#3F4859" }}>
        {categories.map((c, i) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
            {categoryName(c)}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height }}>
        {bars.map((b) => (
          <div key={b.month} role="img" aria-label={`${b.label}, ${format(b.total)}`} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
            <span className="num" style={{ fontSize: 12, fontWeight: 600, color: b.total ? "#14171F" : "#9AA3B5" }}>
              {b.total ? format(b.total) : "–"}
            </span>
            <span style={{ display: "flex", flexDirection: "column-reverse", width: "100%", maxWidth: 64, borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
              {b.values.map((v, i) => (
                <span key={i} style={{ display: "block", width: "100%", background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], height: v ? Math.max(2, Math.round((v / max) * barArea)) : 0 }} />
              ))}
            </span>
            <span style={{ fontSize: 12, color: "#5B6475" }}>{b.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
