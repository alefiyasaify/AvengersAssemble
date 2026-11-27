import { CarOutlined, CoffeeOutlined, HomeOutlined, SendOutlined, TagOutlined } from "@ant-design/icons";

// Expense categories (API enum -> label, icon, tile colours from the design).
export const CATEGORIES = {
  MEALS: { label: "Meals", Icon: CoffeeOutlined, bg: "#FFEBC2", fg: "#7A4200" },
  HOTEL: { label: "Hotel", Icon: HomeOutlined, bg: "#E1EAFF", fg: "#1D4ED8" },
  LOCAL_CAB: { label: "Local cab", Icon: CarOutlined, bg: "#EAE5FF", fg: "#4B2FB5" },
  TRAVEL: { label: "Travel", Icon: SendOutlined, bg: "#DDF4E7", fg: "#0B6B42" },
  OTHER: { label: "Other", Icon: TagOutlined, bg: "#ECEFF5", fg: "#4A5366" },
};

export function CategoryIcon({ category, size = 42 }) {
  const meta = CATEGORIES[category] ?? CATEGORIES.OTHER;
  const { Icon } = meta;
  return (
    <span className="cat-tile" style={{ width: size, height: size, background: meta.bg, color: meta.fg }} aria-hidden="true">
      <Icon />
    </span>
  );
}
