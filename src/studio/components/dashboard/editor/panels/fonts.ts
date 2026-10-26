/* Shared font constants & loader used by multiple editor sub-components */
import { apiUrl } from "@/studio/lib/api";
import { proxyFontUrl } from "@/studio/lib/imageProxy";

// Track loading state per font so callers can await `document.fonts.ready`
// consistently. We store a Promise keyed by family name; the first caller
// creates the stylesheet and the promise, subsequent callers reuse it.
// If the stylesheet fails to load we REMOVE the entry so retries work —
// previously the family was added to a Set before the fetch even started
// and any failure left the font permanently missing.
const fontPromises = new Map<string, Promise<void>>();

export function loadGoogleFont(fontFamily: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = fontPromises.get(fontFamily);
  if (existing) return existing;

  const fam = encodeURIComponent(fontFamily);
  // Try the full multi-weight + italic URL first. Many Google Fonts ship
  // only a regular weight (Bebas Neue, Pacifico, Lobster, Permanent
  // Marker, ...) and Google returns 400 Bad Request when you request
  // weights the font doesn't have — the entire CSS load fails and no
  // @font-face rule is registered. Cascade through progressively smaller
  // requests so we end up with SOMETHING usable for every font:
  //   1. wght@300..800 + italic   — full coverage for multi-weight fonts
  //   2. wght@400;700              — universal-ish (most fonts have these)
  //   3. no weight axis            — fetches the default face only;
  //                                  this URL succeeds for every Google
  //                                  Font that exists.
  const urls = [
    `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,300;0,400;0,600;0,700;0,800;1,400;1,700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}&display=swap`,
  ];

  const p = new Promise<void>((resolve) => {
    const tryNext = (idx: number) => {
      if (idx >= urls.length) {
        // Every variant failed — drop the cache entry so callers can
        // retry later (e.g. after the user reconnects).
        fontPromises.delete(fontFamily);
        resolve();
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = urls[idx];
      link.onload = async () => {
        try {
          if (typeof document !== "undefined" && (document as any).fonts?.ready) {
            await (document as any).fonts.ready;
          }
        } catch { /* ignore */ }
        resolve();
      };
      link.onerror = () => {
        link.remove();
        tryNext(idx + 1);
      };
      document.head.appendChild(link);
    };
    tryNext(0);
  });

  fontPromises.set(fontFamily, p);
  return p;
}

/* ═══════════════════════════════════════════════════════════════
   Custom fonts — user-uploaded @font-face loader + shared registry
   Shared across the text panel and the toolbar font picker so that
   an imported font is immediately visible everywhere.
   ═══════════════════════════════════════════════════════════════ */
export interface CustomFont { fileName: string; displayName: string; url: string }

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const resolveFontUrl = (u: string) =>
  /^https?:\/\//i.test(u) ? u : `${BACKEND_BASE}${u.startsWith("/") ? "" : "/"}${u}`;

const loadedCustomFonts = new Set<string>();
export function loadCustomFontFace(font: CustomFont) {
  if (loadedCustomFonts.has(font.fileName) || typeof document === "undefined") return;
  loadedCustomFonts.add(font.fileName);
  const ext = font.fileName.split(".").pop()?.toLowerCase() || "woff2";
  const format = ext === "ttf" ? "truetype" : ext === "otf" ? "opentype" : ext === "woff" ? "woff" : "woff2";
  // Resolve relative paths to absolute, then proxy booth/CDN URLs through
  // the editor backend's font-proxy so the browser sees a single, sane
  // CORS header. Local /uploads/... fonts are not on the proxy allowlist
  // and pass through untouched.
  const absoluteUrl = proxyFontUrl(resolveFontUrl(font.url));
  const style = document.createElement("style");
  style.textContent = `@font-face { font-family: '${font.displayName}'; src: url('${absoluteUrl}') format('${format}'); font-display: swap; }`;
  document.head.appendChild(style);
}

let customFontsCache: CustomFont[] = [];
const customFontsListeners = new Set<(fonts: CustomFont[]) => void>();

export function getCustomFonts(): CustomFont[] {
  return customFontsCache;
}

export function setCustomFonts(fonts: CustomFont[]) {
  customFontsCache = fonts;
  fonts.forEach(loadCustomFontFace);
  customFontsListeners.forEach(l => l(customFontsCache));
}

export function subscribeCustomFonts(listener: (fonts: CustomFont[]) => void): () => void {
  customFontsListeners.add(listener);
  return () => { customFontsListeners.delete(listener); };
}

/** Fetches the user's custom fonts and broadcasts to all subscribers. */
export async function fetchCustomFontsFromApi(): Promise<CustomFont[]> {
  try {
    // 15s timeout — avoids hanging forever on flaky connections.
    const { fetchWithTimeout } = await import("../canvas/canvasUtils");
    const res = await fetchWithTimeout(apiUrl("/api/fonts"), { timeoutMs: 15000 });
    if (res.ok) {
      const data = await res.json();
      const fonts: CustomFont[] = data.fonts || [];
      setCustomFonts(fonts);
      return fonts;
    }
  } catch { /* offline */ }
  return customFontsCache;
}

/**
 * Fetches external (booth Selfizee) fonts by their exact fontFamily names.
 * Used when loading a catalogue model whose text objects reference fonts
 * not in the studio's Google Fonts list (e.g. "Poppins-SemiBold",
 * "BebasNeue-Bold", "MONTSERRAT"). The backend resolves each name to a
 * hosted file URL and returns a CustomFont array — same shape as
 * /api/fonts so we can reuse loadCustomFontFace and the picker registry.
 *
 * Names already loaded (Google Fonts in FONT_LIST or already-registered
 * custom fonts) should be filtered out by the caller before calling this.
 *
 * Returns the fonts that were resolved (already loaded via @font-face);
 * any name the backend couldn't resolve is silently omitted.
 */
export async function fetchExternalFontsByNames(names: string[]): Promise<CustomFont[]> {
  if (!Array.isArray(names) || names.length === 0) return [];
  try {
    const { fetchWithTimeout } = await import("../canvas/canvasUtils");
    // Booth fonts (celles référencées par les modèles du catalogue) sont
    // servies par le CakePHP booth, comme le catalogue lui-même. Kalifun n'a
    // AUCUN rewrite /api/* (contrairement à booth-ui) : on passe donc par la
    // route App Router native /editor-api/bibliotheques/external, qui relaie
    // vers le booth côté serveur (pas de CORS, pas de Mixed Content en HTTP).
    // apiUrl("/api/…") → "/editor-api/…".
    const qs = names.map(encodeURIComponent).join(",");
    const res = await fetchWithTimeout(apiUrl(`/api/bibliotheques/external?names=${qs}`), { timeoutMs: 15000 });
    if (!res.ok) return [];
    const data = await res.json();
    const fonts: CustomFont[] = Array.isArray(data?.fonts) ? data.fonts : [];
    if (fonts.length === 0) return [];
    // Merge into the custom-font registry so they appear in the picker AND
    // get loaded via @font-face. setCustomFonts replaces the list, so
    // concatenate with what's already there to avoid wiping user uploads.
    const existing = getCustomFonts();
    const byName = new Map<string, CustomFont>(existing.map((f) => [f.displayName, f]));
    for (const f of fonts) byName.set(f.displayName, f);
    setCustomFonts(Array.from(byName.values()));
    // Wait for the FontFace promises to resolve so the caller can render
    // text immediately without falling back to the default font.
    try {
      const docFonts = (typeof document !== "undefined" ? (document as any).fonts : null);
      if (docFonts?.load) {
        await Promise.all(fonts.map((f) => docFonts.load(`16px "${f.displayName}"`).catch(() => undefined)));
      }
      if (docFonts?.ready) await docFonts.ready;
    } catch { /* ignore — text will render with fallback if anything fails */ }
    return fonts;
  } catch { return []; }
}

/**
 * Walks a fabric scene (post-normalize) and returns every distinct
 * fontFamily reference found — on top-level text objects AND inside
 * per-character `styles` maps. Used to figure out which booth fonts to
 * fetch before enlivening a catalogue model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function collectFontFamilies(objects: any[]): string[] {
  const out = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.fontFamily === "string" && o.fontFamily.trim()) out.add(o.fontFamily.trim());
    // styles can be either an array (textbox per-char) or a {line: {char: {...}}} map
    if (Array.isArray(o.styles)) {
      for (const s of o.styles) {
        if (s && typeof s === "object" && typeof s.fontFamily === "string") out.add(s.fontFamily.trim());
      }
    } else if (o.styles && typeof o.styles === "object") {
      for (const lineKey of Object.keys(o.styles)) {
        const line = o.styles[lineKey];
        if (!line || typeof line !== "object") continue;
        for (const chKey of Object.keys(line)) {
          const ch = line[chKey];
          if (ch && typeof ch === "object" && typeof ch.fontFamily === "string") out.add(ch.fontFamily.trim());
        }
      }
    }
    if (Array.isArray(o.objects)) o.objects.forEach(visit);
  };
  objects.forEach(visit);
  return Array.from(out);
}

/* ═══════════════════════════════════════════════════════════════
   Thematic font categories
   ═══════════════════════════════════════════════════════════════ */

export type FontCategory = "moderne" | "elegant" | "fun" | "bold" | "amour" | "festif" | "retro" | "manuscrit" | "minimal";

export const FONT_CATEGORIES: { id: FontCategory; label: string; color: string; bg: string; preview: string }[] = [
  { id: "moderne", label: "Moderne", color: "#3b82f6", bg: "#eff6ff", preview: "Hello !" },
  { id: "elegant", label: "Chic", color: "#6366f1", bg: "#ebf0fa", preview: "Merci" },
  { id: "fun", label: "Fun", color: "#f59e0b", bg: "#fffbeb", preview: "Yeah !" },
  { id: "bold", label: "Impact", color: "#ef4444", bg: "#fef2f2", preview: "WOW" },
  { id: "amour", label: "Amour", color: "#ec4899", bg: "#fdf2f8", preview: "Love" },
  { id: "festif", label: "Festif", color: "#f97316", bg: "#fff7ed", preview: "Party !" },
  { id: "retro", label: "Rétro", color: "#78716c", bg: "#f5f5f4", preview: "Vintage" },
  { id: "manuscrit", label: "Manuscrit", color: "#14b8a6", bg: "#f0fdfa", preview: "Bisous" },
  { id: "minimal", label: "Épuré", color: "#6b7280", bg: "#f9fafb", preview: "Simple" },
];

export interface FontDef {
  name: string;
  category: FontCategory;
  keywords?: string[];
}

export const FONT_LIST: FontDef[] = [
  // ── Moderne ── clean, contemporary, corporate
  { name: "Inter", category: "moderne", keywords: ["professionnel", "corporate", "startup", "tech", "application", "web", "lisible", "neutre", "sobre", "business", "entreprise"] },
  { name: "Montserrat", category: "moderne", keywords: ["professionnel", "geometric", "titre", "logo", "mode", "agence", "startup", "tendance", "branché", "urbain"] },
  { name: "Poppins", category: "moderne", keywords: ["arrondi", "friendly", "doux", "startup", "tech", "application", "jeune", "dynamique", "web", "tendance", "instagram"] },
  { name: "DM Sans", category: "moderne", keywords: ["neutre", "propre", "lisible", "tech", "startup", "application", "interface", "sobre", "discret", "corporate"] },
  { name: "Outfit", category: "moderne", keywords: ["geometric", "mode", "tendance", "branché", "design", "agence", "portfolio", "créatif", "stylé"] },
  { name: "Plus Jakarta Sans", category: "moderne", keywords: ["professionnel", "propre", "tech", "startup", "saas", "application", "interface", "premium", "business"] },
  { name: "Manrope", category: "moderne", keywords: ["geometric", "tech", "startup", "futuriste", "propre", "lisible", "application", "interface", "saas"] },
  { name: "Figtree", category: "moderne", keywords: ["friendly", "arrondi", "doux", "accessible", "lisible", "web", "blog", "naturel", "frais"] },
  { name: "Sora", category: "moderne", keywords: ["geometric", "futuriste", "tech", "spatial", "science", "innovation", "startup", "moderne"] },
  { name: "Space Grotesk", category: "moderne", keywords: ["spatial", "futuriste", "tech", "science", "geek", "code", "developer", "innovation", "cyber"] },
  { name: "Red Hat Display", category: "moderne", keywords: ["professionnel", "corporate", "tech", "open source", "titre", "gras", "puissant", "business"] },

  // ── Chic / Élégant ── mariage, luxe, raffiné
  { name: "Playfair Display", category: "elegant", keywords: ["luxe", "mariage", "magazine", "mode", "raffiné", "classique", "titre", "beauté", "cosmétique", "bijoux", "haute couture", "premium", "prestige", "chic"] },
  { name: "Cormorant Garamond", category: "elegant", keywords: ["luxe", "mariage", "littéraire", "livre", "poésie", "raffiné", "classique", "fin", "délicat", "beauté", "parfum", "mode"] },
  { name: "EB Garamond", category: "elegant", keywords: ["classique", "livre", "littéraire", "académique", "traditionnel", "sérieux", "editorial", "journal", "presse", "raffiné"] },
  { name: "DM Serif Display", category: "elegant", keywords: ["titre", "editorial", "magazine", "blog", "mode", "luxe", "classique", "raffiné", "beauté", "stylé"] },
  { name: "Libre Baskerville", category: "elegant", keywords: ["classique", "livre", "littéraire", "sérieux", "editorial", "académique", "journal", "traditionnel", "raffiné"] },
  { name: "Spectral", category: "elegant", keywords: ["lecture", "livre", "littéraire", "fin", "délicat", "élégant", "editorial", "classique", "sérieux"] },
  { name: "Fraunces", category: "elegant", keywords: ["original", "artistique", "mode", "magazine", "créatif", "luxe", "beauté", "whisky", "vintage", "caractère"] },
  { name: "Noto Serif", category: "elegant", keywords: ["universel", "classique", "lisible", "sérieux", "journal", "editorial", "presse", "international", "multilingue"] },

  // ── Fun ── bubbly, playful, enfantin
  { name: "Fredoka", category: "fun", keywords: ["enfant", "bébé", "arrondi", "bulle", "jouet", "joyeux", "mignon", "kawaii", "cartoon", "gâteau", "bonbon", "doux", "crèche", "école"] },
  { name: "Comfortaa", category: "fun", keywords: ["arrondi", "doux", "futuriste", "friendly", "cozy", "confort", "chaleureux", "bien-être", "zen", "yoga", "bio", "nature", "tropical"] },
  { name: "Quicksand", category: "fun", keywords: ["arrondi", "léger", "doux", "friendly", "plage", "sable", "été", "vacances", "tropical", "voyage", "zen", "bien-être", "nature"] },
  { name: "Nunito", category: "fun", keywords: ["arrondi", "friendly", "doux", "enfant", "éducation", "application", "joyeux", "accessible", "blog", "famille"] },
  { name: "Rubik", category: "fun", keywords: ["arrondi", "geometric", "jeu", "puzzle", "moderne", "application", "interface", "tech", "dynamique", "coloré"] },
  { name: "Baloo 2", category: "fun", keywords: ["enfant", "cartoon", "joyeux", "gras", "bulle", "jouet", "fête", "anniversaire", "goûter", "bonbon", "rigolo"] },
  { name: "Bubblegum Sans", category: "fun", keywords: ["enfant", "bonbon", "bulle", "chewing-gum", "sucré", "rose", "fille", "mignon", "fête", "gourmand", "candy"] },
  { name: "Patrick Hand", category: "fun", keywords: ["manuscrit", "décontracté", "cahier", "école", "note", "crayon", "naturel", "authentique", "blog", "personnel"] },
  { name: "Indie Flower", category: "fun", keywords: ["manuscrit", "fleur", "printemps", "nature", "jardin", "doodle", "cahier", "fille", "mignon", "poétique", "bohème"] },
  { name: "Architects Daughter", category: "fun", keywords: ["manuscrit", "croquis", "dessin", "architecte", "plan", "crayon", "décontracté", "créatif", "note", "carnet"] },

  // ── Impact / Bold ── fort, puissant, attention
  { name: "Bebas Neue", category: "bold", keywords: ["titre", "affiche", "cinéma", "film", "sport", "condensé", "majuscule", "poster", "urbain", "street", "gym", "fitness", "promo", "soldes"] },
  { name: "Anton", category: "bold", keywords: ["titre", "affiche", "impact", "sport", "condensé", "majuscule", "poster", "puissant", "fort", "gras", "promo", "soldes", "pub"] },
  { name: "Oswald", category: "bold", keywords: ["titre", "condensé", "journal", "presse", "news", "editorial", "sport", "sérieux", "urbain", "majuscule"] },
  { name: "Alfa Slab One", category: "bold", keywords: ["western", "pub", "rétro", "affiche", "gras", "épais", "titre", "puissant", "country", "texas", "saloon", "bière"] },
  { name: "Archivo Black", category: "bold", keywords: ["titre", "gras", "puissant", "fort", "sport", "gym", "fitness", "impact", "affiche", "promo"] },
  { name: "Lilita One", category: "bold", keywords: ["titre", "cartoon", "fun", "gras", "enfant", "jeu", "vidéo", "affiche", "pub", "dynamique", "joyeux", "latino", "fiesta"] },
  { name: "Passion One", category: "bold", keywords: ["titre", "gras", "passion", "sport", "énergie", "dynamique", "puissant", "fort", "gym", "promo"] },
  { name: "Titan One", category: "bold", keywords: ["titre", "gras", "arrondi", "cartoon", "jeu", "puissant", "fort", "enfant", "mascotte", "sport"] },
  { name: "Black Ops One", category: "bold", keywords: ["militaire", "armée", "tactique", "jeu", "gaming", "guerre", "combat", "stencil", "aventure", "survie", "airsoft"] },
  { name: "Bangers", category: "bold", keywords: ["bande dessinée", "comics", "cartoon", "affiche", "pop art", "fun", "titre", "dynamique", "super-héros", "explosion"] },
  { name: "Bungee", category: "bold", keywords: ["urbain", "street", "graffiti", "hip-hop", "sport", "extrême", "skate", "surf", "coloré", "panneau", "enseigne"] },

  // ── Amour ── romantique, mariage, couple
  { name: "Great Vibes", category: "amour", keywords: ["mariage", "invitation", "calligraphie", "romantique", "couple", "saint-valentin", "fiançailles", "cérémonie", "élégant", "faire-part", "noces"] },
  { name: "Sacramento", category: "amour", keywords: ["mariage", "invitation", "script", "délicat", "romantique", "couple", "saint-valentin", "doux", "fin", "faire-part", "menu"] },
  { name: "Alex Brush", category: "amour", keywords: ["mariage", "invitation", "calligraphie", "romantique", "pinceau", "élégant", "couple", "faire-part", "doux", "féminin"] },
  { name: "Allura", category: "amour", keywords: ["mariage", "invitation", "script", "romantique", "élégant", "couple", "saint-valentin", "calligraphie", "faire-part", "poétique"] },
  { name: "Rouge Script", category: "amour", keywords: ["mariage", "romantique", "français", "paris", "élégant", "vintage", "chic", "bistrot", "classique", "menu"] },
  { name: "Cookie", category: "amour", keywords: ["doux", "chaleureux", "cozy", "gourmand", "pâtisserie", "cuisine", "recette", "blog", "féminin", "mignon", "sucré"] },
  { name: "Lora", category: "amour", keywords: ["mariage", "littéraire", "livre", "blog", "élégant", "classique", "doux", "lecture", "poésie", "romantique", "roman"] },
  { name: "Crimson Text", category: "amour", keywords: ["classique", "littéraire", "livre", "roman", "poésie", "élégant", "sérieux", "lecture", "editorial", "raffiné"] },
  { name: "Cardo", category: "amour", keywords: ["classique", "littéraire", "académique", "livre", "sérieux", "élégant", "raffiné", "ancien", "historique", "traditionnel"] },

  // ── Festif ── fête, anniversaire, party
  { name: "Pacifico", category: "festif", keywords: ["surf", "plage", "été", "vacances", "tropical", "californie", "cool", "décontracté", "cocktail", "tiki", "hawaii", "soleil", "voyage", "palmier"] },
  { name: "Lobster", category: "festif", keywords: ["restaurant", "food", "cuisine", "mer", "plage", "été", "tropical", "festif", "pub", "enseigne", "rétro", "vintage", "bar"] },
  { name: "Permanent Marker", category: "festif", keywords: ["graffiti", "street", "urbain", "marqueur", "feutre", "punk", "rock", "musique", "concert", "affiche", "poster", "rebelle"] },
  { name: "Shadows Into Light", category: "festif", keywords: ["manuscrit", "doux", "lumière", "rêve", "poétique", "bohème", "nature", "spirituel", "zen", "journal intime"] },
  { name: "Caveat", category: "festif", keywords: ["manuscrit", "note", "crayon", "authentique", "naturel", "décontracté", "blog", "personnel", "journal", "cahier", "annotation"] },
  { name: "Kaushan Script", category: "festif", keywords: ["calligraphie", "pinceau", "dynamique", "énergie", "sport", "vintage", "bière", "craft", "artisanal", "badge", "logo"] },
  { name: "Courgette", category: "festif", keywords: ["pinceau", "cuisine", "food", "restaurant", "menu", "traiteur", "gourmand", "artisanal", "marché", "bio", "italien"] },
  { name: "Bowlby One SC", category: "festif", keywords: ["titre", "gras", "rétro", "pub", "affiche", "enseigne", "vintage", "années 50", "américain", "diner", "bowling"] },
  { name: "Righteous", category: "festif", keywords: ["rétro", "années 70", "disco", "groove", "funk", "musique", "cool", "arrondi", "vintage", "festival", "hippie"] },

  // ── Rétro ── vintage, nostalgique, old school
  { name: "Abril Fatface", category: "retro", keywords: ["titre", "affiche", "editorial", "magazine", "mode", "vintage", "classique", "élégant", "poster", "luxe", "display"] },
  { name: "Monoton", category: "retro", keywords: ["néon", "neon", "rétro", "années 80", "synthwave", "disco", "nuit", "club", "enseigne", "lumière", "vegas", "casino"] },
  { name: "Press Start 2P", category: "retro", keywords: ["pixel", "jeu vidéo", "gaming", "arcade", "8-bit", "retro gaming", "geek", "console", "nintendo", "atari", "informatique"] },
  { name: "Bungee Shade", category: "retro", keywords: ["3d", "ombre", "rétro", "enseigne", "vintage", "affiche", "titre", "années 70", "pub", "carnival", "cirque"] },
  { name: "Creepster", category: "retro", keywords: ["halloween", "horreur", "effrayant", "monstre", "gothique", "dark", "sombre", "mystère", "fantôme", "zombie", "sang"] },
  { name: "Josefin Sans", category: "retro", keywords: ["art déco", "gatsby", "années 20", "élégant", "géométrique", "vintage", "mode", "magazine", "chic", "scandinave"] },
  { name: "Raleway", category: "retro", keywords: ["fin", "léger", "élégant", "mode", "magazine", "art déco", "titre", "portfolio", "design", "minimaliste", "chic"] },
  { name: "Merriweather", category: "retro", keywords: ["lecture", "blog", "livre", "journal", "classique", "sérieux", "traditionnel", "editorial", "presse", "article"] },
  { name: "PT Serif", category: "retro", keywords: ["classique", "journal", "presse", "editorial", "livre", "sérieux", "traditionnel", "lecture", "russe", "académique"] },
  { name: "Bitter", category: "retro", keywords: ["lecture", "livre", "confortable", "classique", "sérieux", "blog", "article", "editorial", "chaleureux", "traditionnel"] },

  // ── Manuscrit ── écriture à la main, calligraphie
  { name: "Dancing Script", category: "manuscrit", keywords: ["calligraphie", "élégant", "invitation", "mariage", "féminin", "doux", "romantique", "carte", "danse", "gracieux", "script"] },
  { name: "Satisfy", category: "manuscrit", keywords: ["rétro", "vintage", "pin-up", "années 50", "américain", "diner", "route 66", "rock", "tatouage", "cool", "décontracté"] },
  { name: "Mr Dafoe", category: "manuscrit", keywords: ["signature", "autographe", "prestige", "luxe", "exclusif", "vip", "calligraphie", "pinceau", "élégant", "rapide"] },
  { name: "Kalam", category: "manuscrit", keywords: ["manuscrit", "enfant", "école", "crayon", "naturel", "cahier", "écriture", "simple", "authentique", "indien", "chaleureux"] },
  { name: "Amatic SC", category: "manuscrit", keywords: ["fin", "étroit", "naturel", "bio", "organic", "marché", "artisanal", "bohème", "hippie", "handmade", "fait main", "café"] },
  { name: "Handlee", category: "manuscrit", keywords: ["manuscrit", "décontracté", "naturel", "note", "crayon", "simple", "enfant", "cahier", "authentique", "personnel"] },

  // ── Épuré / Minimaliste ── léger, aéré, sobre
  { name: "Roboto", category: "minimal", keywords: ["google", "android", "application", "interface", "tech", "neutre", "propre", "lisible", "universel", "sobre", "professionnel"] },
  { name: "Open Sans", category: "minimal", keywords: ["universel", "lisible", "propre", "neutre", "web", "application", "corporate", "sobre", "professionnel", "accessible"] },
  { name: "Lato", category: "minimal", keywords: ["chaleureux", "friendly", "professionnel", "corporate", "lisible", "web", "sobre", "équilibré", "discret", "neutre"] },
  { name: "Nunito Sans", category: "minimal", keywords: ["arrondi", "doux", "friendly", "lisible", "application", "interface", "propre", "accessible", "web", "sobre"] },
  { name: "Work Sans", category: "minimal", keywords: ["professionnel", "bureau", "corporate", "sobre", "lisible", "interface", "application", "neutre", "business", "sérieux"] },
  { name: "Source Sans 3", category: "minimal", keywords: ["adobe", "lisible", "propre", "code", "tech", "interface", "application", "neutre", "sobre", "professionnel"] },
  { name: "Mulish", category: "minimal", keywords: ["doux", "arrondi", "friendly", "lisible", "propre", "web", "blog", "sobre", "neutre", "discret"] },
  { name: "Karla", category: "minimal", keywords: ["geometric", "propre", "lisible", "design", "portfolio", "sobre", "discret", "élégant", "moderne", "fin"] },
  { name: "Lexend", category: "minimal", keywords: ["lisible", "accessible", "dyslexie", "éducation", "lecture", "inclusif", "propre", "clair", "web", "application"] },
  { name: "Albert Sans", category: "minimal", keywords: ["geometric", "propre", "moderne", "tech", "interface", "sobre", "neutre", "design", "minimaliste", "épuré"] },
  { name: "Barlow", category: "minimal", keywords: ["condensé", "industriel", "technique", "transport", "signalétique", "propre", "lisible", "sobre", "urbain", "moderne"] },
];

// Backward compat
export const GOOGLE_FONTS = [...new Set(FONT_LIST.map(f => f.name))];

/* ═══════════════════════════════════════════════════════════════
   Font search helper – matches name, category label & keywords
   ═══════════════════════════════════════════════════════════════ */

export function searchFonts(query: string): FontDef[] {
  if (!query.trim()) return FONT_LIST;
  const q = query.toLowerCase().trim();
  return FONT_LIST.filter(f => {
    // Match font name
    if (f.name.toLowerCase().includes(q)) return true;
    // Match category label
    const cat = FONT_CATEGORIES.find(c => c.id === f.category);
    if (cat && cat.label.toLowerCase().includes(q)) return true;
    // Match category id
    if (f.category.toLowerCase().includes(q)) return true;
    // Match keywords
    if (f.keywords?.some(kw => kw.toLowerCase().includes(q))) return true;
    return false;
  });
}

/** Search ALL_FONTS (includes fallback fonts) by name + keywords */
export function searchAllFonts(query: string): string[] {
  if (!query.trim()) return [...GOOGLE_FONTS, "sans-serif", "serif", "monospace"];
  const q = query.toLowerCase().trim();
  const matched = searchFonts(q).map(f => f.name);
  // Also include generic fallbacks if they match by name
  const fallbacks = ["sans-serif", "serif", "monospace"].filter(f => f.includes(q));
  return [...matched, ...fallbacks];
}

// Keep FONT_COMBOS for backward compat but no longer used in panel
export const FONT_COMBOS: { name: string; title: string; titleFont: string; body: string; bodyFont: string }[] = [
  { name: "Moderne", title: "Votre titre", titleFont: "Montserrat", body: "Votre texte ici", bodyFont: "Inter" },
  { name: "Élégant", title: "Votre titre", titleFont: "Playfair Display", body: "Votre texte ici", bodyFont: "Lora" },
  { name: "Fun", title: "Votre titre", titleFont: "Pacifico", body: "Votre texte ici", bodyFont: "Poppins" },
  { name: "Manuscrit", title: "Votre titre", titleFont: "Dancing Script", body: "Votre texte ici", bodyFont: "Quicksand" },
  { name: "Bold", title: "VOTRE TITRE", titleFont: "Bebas Neue", body: "Votre texte ici", bodyFont: "Open Sans" },
  { name: "Vintage", title: "Votre titre", titleFont: "Abril Fatface", body: "Votre texte ici", bodyFont: "Raleway" },
  { name: "Naturel", title: "Votre titre", titleFont: "Caveat", body: "Votre texte ici", bodyFont: "Comfortaa" },
  { name: "Festif", title: "Votre titre", titleFont: "Lobster", body: "Votre texte ici", bodyFont: "Merriweather" },
];

export const ALL_FONTS = [...GOOGLE_FONTS, "sans-serif", "serif", "monospace"];
