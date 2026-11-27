/** ExpenseFlow logo mark (arrow into a bar). */
export function BrandLogo({ size = 36, inverted = false }) {
  const stroke = inverted ? "#1F4FD8" : "#FFFFFF";
  return (
    <span
      className="ef-brand-mark"
      style={{
        width: size,
        height: size,
        ...(inverted ? { background: "#fff", boxShadow: "none", borderRadius: 12 } : null),
      }}
    >
      <svg
        width={Math.round(size * 0.53)}
        height={Math.round(size * 0.53)}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12h10" />
        <path d="M10 6l6 6-6 6" />
        <path d="M20 5v14" />
      </svg>
    </span>
  );
}
