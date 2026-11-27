// Ant Design theme tuned to the ExpenseFlow design canvas (Inter / Space Grotesk, blue #2563EB).
// Colours used outside antd components live as CSS variables in styles/global.css.

export const colors = {
  primary: "#2563EB",
  primaryDeep: "#1F4FD8",
  primaryHover: "#1D4ED8",
  ink: "#0E1424",
  muted: "#5B6475",
  layout: "#EEF1F8",
  surfaceAlt: "#F3F5FB",
  border: "#E3E7F1",
  ok: "#0B6B42",
  warn: "#7A4200",
  bad: "#A5271B",
  amber: "#E59A12",
  red: "#E5483A",
};

export const theme = {
  cssVar: true,
  token: {
    colorPrimary: colors.primary,
    colorLink: colors.primaryHover,
    colorText: colors.ink,
    colorTextSecondary: colors.muted,
    colorTextTertiary: colors.muted,
    colorBgLayout: colors.layout,
    colorBorder: "#D5D9E3",
    colorBorderSecondary: "#EEF0F5",
    colorSuccess: "#16A34A",
    colorWarning: colors.amber,
    colorError: colors.red,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 14,
    borderRadius: 12,
    borderRadiusLG: 20,
    borderRadiusSM: 8,
    controlHeight: 44,
    controlHeightSM: 34,
    controlHeightLG: 52,
  },
  components: {
    Button: { fontWeight: 600, primaryShadow: "0 8px 20px rgba(37,99,235,.35)" },
    Table: {
      headerBg: "transparent",
      headerColor: colors.muted,
      headerSplitColor: "transparent",
      rowSelectedBg: "#F3F7FF",
      rowSelectedHoverBg: "#EAF0FF",
      cellPaddingBlock: 14,
    },
    Segmented: { itemSelectedBg: colors.primary, itemSelectedColor: "#FFFFFF", trackBg: "#FFFFFF" },
    Layout: { siderBg: colors.layout, bodyBg: colors.layout },
    Input: { activeShadow: "0 0 0 3px rgba(37,99,235,.18)" },
    Card: { bodyPadding: 22 },
  },
};
