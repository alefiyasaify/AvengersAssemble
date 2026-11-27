/** Page title, optional description, and optional action buttons on the right. */
export function PageHeader({ title, description, extra }) {
  return (
    <div className="ef-page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {extra ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{extra}</div> : null}
    </div>
  );
}
