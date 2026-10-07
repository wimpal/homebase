"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const LIGHT_THEME_COLOR = "#047857";
const DARK_THEME_COLOR = "#34d399";

/**
 * Keep a single, media-less `meta[name="theme-color"]` in sync with the
 * resolved Appearance so a stored dark preference wins over
 * `prefers-color-scheme` in the browser chrome.
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

    const metas = Array.from(
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    );
    for (const meta of metas) {
      if (meta.getAttribute("media")) meta.remove();
    }

    let meta = metas.find((m) => m.isConnected);
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.removeAttribute("media");
    meta.setAttribute("content", color);
  }, [resolvedTheme]);

  return null;
}
