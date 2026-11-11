/**
 * Runs inline in <head> before first paint so the saved theme is applied
 * without a flash. Dark is the default; only "light" is ever stored/applied.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;
