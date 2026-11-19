/**
 * Runs inline in <head> before first paint so the saved theme is applied
 * without a flash.
 *
 * Dashboard ("theme"): dark is the default; only "light" is ever applied.
 * Public site ("site-theme", Nov 2026 redesign): the visitor's stored choice,
 * else their system preference; applied as html[data-site-theme="dark"]
 * and read only by the site tokens in site.css, so the two never interfere.
 */
export const THEME_INIT_SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem("theme")==="light")d.setAttribute("data-theme","light");var s=localStorage.getItem("site-theme");if(s==="dark"||(!s&&window.matchMedia("(prefers-color-scheme: dark)").matches))d.setAttribute("data-site-theme","dark")}catch(e){}`;
