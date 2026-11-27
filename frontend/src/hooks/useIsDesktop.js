import { useEffect, useState } from "react";

// Same breakpoint as antd's `lg` (laptops and up).
const DESKTOP_QUERY = "(min-width: 992px)";

function matches() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_QUERY).matches : true;
}

/** true on laptop/desktop widths, false on phones and small tablets. Updates on resize. */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(matches);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
