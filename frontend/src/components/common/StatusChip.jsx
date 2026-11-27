/** Coloured status pill. tone: ok | warn | bad | info | neutral */
export function StatusChip({ tone = "neutral", children, style, icon }) {
  return (
    <span className={`chip chip-${tone}`} style={style}>
      {icon}
      {children}
    </span>
  );
}
