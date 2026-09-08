"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./Icons";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.getAttribute("data-theme") === "dark"); }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("regressa_theme", next); } catch {}
    setDark(!dark);
  };
  return <button className="btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme" type="button">{dark ? <IconSun width={14} height={14} /> : <IconMoon width={14} height={14} />}</button>;
}

/** Inline script that applies the stored theme before first paint (avoids a flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("regressa_theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
