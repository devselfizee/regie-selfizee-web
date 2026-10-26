/**
 * Same-origin proxy for Selfizee CDN images.
 *
 * The CakePHP hosts (booth.selfizee.fr, static-media-booth.selfizee.fr, …)
 * stopped returning Access-Control-Allow-Origin once Cloudflare was disabled
 * on selfizee.fr. fabric loads images with crossOrigin="anonymous", so the
 * browser blocks them — both for catalogue templates (json_editeur scenes)
 * and for any element library / photo URL pointing at the same hosts.
 *
 * The Node.js editor backend (port 4000) exposes /api/image-proxy?url=… that
 * fetches and re-serves the bytes with permissive CORS. The booth-ui hits it
 * same-origin via the Next.js rewrite /editor-api/* → backend /api/*.
 */

const PROXIED_HOSTS = new Set([
  "booth.selfizee.fr",
  "static-media-booth.selfizee.fr",
  "www.selfizee.fr",
  "selfizee.fr",
]);

/**
 * Rewrite a URL to go through the editor backend image proxy when its host
 * is one we know returns no CORS headers. Anything else (data URLs, relative
 * paths, hosts already returning CORS) is returned untouched.
 */
export function proxyImageUrl(src: string): string {
  if (!src || typeof src !== "string") return src;
  if (!/^https?:\/\//i.test(src)) return src;
  try {
    const u = new URL(src);
    if (!PROXIED_HOSTS.has(u.hostname)) return src;
    return `/editor-api/image-proxy?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}

/**
 * Same as proxyImageUrl but routes through /editor-api/font-proxy. Needed
 * because fonts CORS is strict (one Access-Control-Allow-Origin header,
 * no exceptions) and the booth's Apache emits two values, which the
 * browser rejects. The proxy re-serves the bytes with a single canonical
 * "*" header.
 */
export function proxyFontUrl(src: string): string {
  if (!src || typeof src !== "string") return src;
  if (!/^https?:\/\//i.test(src)) return src;
  try {
    const u = new URL(src);
    if (!PROXIED_HOSTS.has(u.hostname)) return src;
    return `/editor-api/font-proxy?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}

/**
 * Globally intercept HTMLImageElement#src so every image load — including the
 * ones fabric makes internally inside loadFromJSON / Image.fromObject /
 * enlivenObjects — gets routed through the proxy when the URL points at one
 * of the CORS-blocked Selfizee hosts. proxyImageUrl is a pure pass-through
 * for non-allowlisted hosts, so the patch is a no-op for everything else.
 *
 * Self-installs on first import in the browser. Safe to import multiple
 * times: a sentinel guards against double-patching, which would shadow the
 * original setter twice and break src reads.
 */
function installImageSrcInterceptor(): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__SELFIZEE_IMG_PROXY_PATCHED__) return;

  // Patch the property setter — covers `img.src = url` (the most common path,
  // including fabric's IText/IImage internals).
  const proto = HTMLImageElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "src");
  if (desc && typeof desc.set === "function") {
    const origSet = desc.set;
    const origGet = desc.get;
    Object.defineProperty(proto, "src", {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get(this: HTMLImageElement) {
        return origGet ? origGet.call(this) : this.getAttribute("src") || "";
      },
      set(this: HTMLImageElement, value: string) {
        origSet.call(this, proxyImageUrl(value));
      },
    });
  }

  // Patch setAttribute too — some library code (and fabric in certain paths)
  // writes the src via `el.setAttribute("src", url)`, which bypasses the
  // property setter above. Limit the rewrite to <img> elements so we don't
  // perturb unrelated tags that happen to take a src attribute.
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (
    this: Element,
    name: string,
    value: string,
  ): void {
    if (this instanceof HTMLImageElement && (name === "src" || name === "SRC")) {
      return origSetAttr.call(this, name, proxyImageUrl(value));
    }
    return origSetAttr.call(this, name, value);
  };

  w.__SELFIZEE_IMG_PROXY_PATCHED__ = true;
  // One-shot debug breadcrumb so we can confirm in the browser console that
  // the patch is actually in place. Remove once the proxy is fully proven.
  // eslint-disable-next-line no-console
  console.info("[imageProxy] HTMLImageElement#src interceptor installed");
}

installImageSrcInterceptor();
