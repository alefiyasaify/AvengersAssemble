import { useIsDesktop } from "../../hooks/useIsDesktop";
import { DesktopLayout } from "./DesktopLayout";
import { MobileLayout } from "./MobileLayout";

/**
 * Employee screens: sidebar layout on laptops, phone layout (bottom tab bar) on small screens.
 * The pages themselves also adapt using useIsDesktop().
 */
export function EmployeeLayout() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopLayout allowedRoles={["employee", "manager", "auditor", "head"]} /> : <MobileLayout />;
}
