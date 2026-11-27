/** Round avatar showing a person's initials. */
export function InitialsAvatar({ text, size = 34, filled = false, style }) {
  return (
    <span
      className="avatar-ini"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size / 3)),
        ...(filled ? { background: "#2563EB", color: "#fff" } : null),
        ...style,
      }}
    >
      {text}
    </span>
  );
}
