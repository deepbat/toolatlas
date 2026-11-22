/**
 * Prepare a print view for the desktop app's native PDF save. The HTML is built from a user's own file, so treat it as untrusted:
 * keep text, tables, styles and embedded (data:) images; drop scripts, frames, plugins, forms, remote resources and event handlers.
 * The desktop side also applies a Content-Security-Policy, so this step is for clean output, not the only protection.
 */
const DROP = 'script,iframe,frame,frameset,object,embed,applet,link,base,form,audio,video,source,track,portal,meta[http-equiv],noscript';

function remoteUrl(v: string): boolean {
  const t = v.trim().toLowerCase();
  return t !== '' && !t.startsWith('data:') && !t.startsWith('#');
}

function cleanCss(css: string): string {
  // url(...) and @import that do not point at data: are removed; @font-face sources and background images may carry data: URLs.
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, 'none');
}

export function sanitizePrintHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROP).forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'srcdoc' || n === 'ping') el.removeAttribute(a.name);
      else if ((n === 'src' || n === 'href' || n === 'poster' || n === 'data' || n === 'xlink:href' || n === 'action' || n === 'formaction') && remoteUrl(a.value)) {
        if (el.tagName === 'IMG' || el.tagName === 'IMAGE' || el.tagName === 'SVG') el.remove();
        else el.removeAttribute(a.name);
      } else if (n === 'srcset') el.removeAttribute(a.name);
      else if (n === 'style') el.setAttribute('style', cleanCss(a.value));
    }
  });
  doc.querySelectorAll('style').forEach(st => { st.textContent = cleanCss(st.textContent ?? ''); });
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
