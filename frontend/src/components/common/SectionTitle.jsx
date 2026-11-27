/** Bold section heading with a small grey hint on the right. */
export function SectionTitle({ title, hint }) {
  return (
    <div className="section-title">
      <b>{title}</b>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}
