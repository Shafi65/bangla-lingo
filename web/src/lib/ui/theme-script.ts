// Server-safe: the pre-paint theme script for app/layout.tsx (see theme.ts).
export const THEME_KEY = "banglalingo.theme";

/**
 * Runs in <head> before paint. Kept dependency-free and tiny; also follows OS
 * changes while the preference is "system".
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,k=${JSON.stringify(
  THEME_KEY,
)},m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var p=null;try{p=localStorage.getItem(k)}catch(e){}if(p!=="light"&&p!=="dark")p="system";d.dataset.themePref=p;d.dataset.theme=p==="dark"||(p==="system"&&m.matches)?"dark":"light"}a();try{m.addEventListener("change",function(){if(d.dataset.themePref==="system")a()})}catch(e){}})();`;
