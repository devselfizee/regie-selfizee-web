import type { ZoneBorne } from "@/studio/regie/zonesBorne";

/**
 * Format & gabarit definitions for the frame creation wizard.
 *
 * Each FORMAT defines a print size / orientation (e.g. "Carte Postale Paysage").
 * Each format has multiple GABARITS — layout templates that define where photos
 * and text zones are placed on the print.
 *
 * Dimensions are stored in PIXELS (the booth's export resolution for cadres,
 * the native asset resolution for non-cadres). The PNG export emits at exactly
 * widthPx × heightPx so frames round-trip pixel-perfect with the legacy booth.
 */

export interface PhotoZone {
  /** Position & size as % of total canvas (0-100) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Régie : copie de la zone n (même photo), comme les miniatures de la carte souvenir */
  copieDe?: number;
  /** Régie : quart de tour de la photo dans sa zone (degrés, sens horaire) : bande couchée */
  rotation?: 90 | 180 | 270;
}

export interface TextZone {
  x: number;
  y: number;
  w: number;
  h: number;
  placeholder?: string;
}

export interface Gabarit {
  id: string;
  name: string;
  photoZones: PhotoZone[];
  textZones: TextZone[];
  /** Régie : zones remplies par la borne (QR, code de séance, date…), posées à la création */
  zonesBorne?: ZoneBorne[];
}

export interface Format {
  id: string;
  name: string;
  poses: string; // "1 pose", "2 à 4 poses", etc.
  /** Canvas aspect ratio (width / height) */
  aspectRatio: number;
  /** Export dimensions in pixels (matches booth's render resolution for cadres) */
  widthPx: number;
  heightPx: number;
  orientation: "landscape" | "portrait";
  /** Numeric format id from the legacy Selfizee CakePHP booth — used to
   *  match this local format with the external catalogue's `format_id`. */
  formatBoothId?: number | null;
  /** Régie : où poser un modèle du catalogue (en % de la page) quand il ne couvre qu'une partie du format */
  zoneModeles?: { x: number; y: number; w: number; h: number };
  gabarits: Gabarit[];
}

/* ═══════════════════════════════════════════
   FORMAT DEFINITIONS
   ═══════════════════════════════════════════ */

/** Zone en pixels d'une page 1240×1844 (10x15 portrait), en % comme les autres zones. */
const px = (x: number, y: number, w: number, h: number) => ({ x: (x / 1240) * 100, y: (y / 1844) * 100, w: (w / 1240) * 100, h: (h / 1844) * 100 });

export const FORMATS: Format[] = [
  {
    id: "carte-postale-paysage",
    formatBoothId: 1,
    name: "Carte Postale Paysage",
    poses: "1 pose",
    aspectRatio: 1844 / 1240,
    widthPx: 1844,
    heightPx: 1240,
    orientation: "landscape",
    gabarits: [
      {
        id: "cpp-1",
        name: "Photo pleine page",
        photoZones: [{ x: 5, y: 5, w: 90, h: 90 }],
        textZones: [],
      },
      {
        id: "cpp-2",
        name: "Photo + bandeau bas",
        photoZones: [{ x: 5, y: 5, w: 90, h: 70 }],
        textZones: [],
      },
      {
        id: "cpp-3",
        name: "Photo + bandeau latéral",
        photoZones: [{ x: 5, y: 5, w: 65, h: 90 }],
        textZones: [],
      },
    ],
  },
  {
    id: "carte-postale-portrait",
    formatBoothId: 2,
    name: "Carte Postale Portrait",
    poses: "1 pose",
    aspectRatio: 1240 / 1844,
    widthPx: 1240,
    heightPx: 1844,
    orientation: "portrait",
    gabarits: [
      {
        id: "cpprt-1",
        name: "Photo pleine page",
        photoZones: [{ x: 5, y: 5, w: 90, h: 90 }],
        textZones: [],
      },
      {
        id: "cpprt-2",
        name: "Photo + bandeau bas",
        photoZones: [{ x: 5, y: 5, w: 90, h: 75 }],
        textZones: [],
      },
    ],
  },
  {
    id: "marque-page",
    formatBoothId: 3,
    name: "Marque-Page",
    poses: "3 à 4 poses",
    aspectRatio: 620 / 1844,
    widthPx: 620,
    heightPx: 1844,
    orientation: "portrait",
    gabarits: [
      {
        id: "mp-3",
        name: "3 photos verticales",
        photoZones: [
          { x: 8, y: 3, w: 84, h: 28 },
          { x: 8, y: 34, w: 84, h: 28 },
          { x: 8, y: 65, w: 84, h: 28 },
        ],
        textZones: [],
      },
      {
        id: "mp-4",
        name: "4 photos verticales",
        photoZones: [
          { x: 8, y: 2, w: 84, h: 22 },
          { x: 8, y: 26, w: 84, h: 22 },
          { x: 8, y: 50, w: 84, h: 22 },
          { x: 8, y: 74, w: 84, h: 22 },
        ],
        textZones: [],
      },
    ],
  },
  {
    // Régie : la bandelette du kit nightlife sur toute sa page 10x15 (1240×1844), coupée en deux par la
    // borne : la bande à gauche (zone vue par l'invité), la carte souvenir à droite avec les miniatures
    // des 4 photos, le QR et le code de séance. Positions du kit (strip_frame.png). Les modèles
    // « marque-page » du catalogue se posent sur la bande.
    id: "bandelette-carte",
    formatBoothId: 3,
    name: "Bandelette + carte souvenir",
    poses: "4 poses",
    aspectRatio: 1240 / 1844,
    widthPx: 1240,
    heightPx: 1844,
    orientation: "portrait",
    zoneModeles: { x: 0, y: 0, w: 50, h: 100 },
    gabarits: [
      {
        id: "bc-4",
        name: "4 photos + carte souvenir",
        photoZones: [
          ...[78, 476, 874, 1272].map((y) => px(37, y, 538, 383)),
          ...[447, 661, 875, 1089].map((y, i) => ({ ...px(791, y, 282, 200), copieDe: i + 1 })),
        ],
        textZones: [],
        zonesBorne: [
          { type: "qr", ...px(832, 1520, 200, 200) },
          { type: "code-seance", ...px(656, 1770, 154, 28), couleur: "#f0c400", align: "left" },
        ],
      },
      {
        // Bande couchée (façon Tabobine) : à lire après un quart de tour horaire, 4 photos côte à côte et
        // un bandeau en bas (bord droit de la bande). La 1re photo est en bas de la page.
        id: "bcc-4",
        name: "Bande couchée + carte souvenir",
        photoZones: [
          ...[1378, 928, 478, 28].map((y) => ({ ...px(30, y, 460, 436), rotation: 270 as const })),
          ...[447, 661, 875, 1089].map((y, i) => ({ ...px(791, y, 282, 200), copieDe: i + 1 })),
        ],
        textZones: [],
        zonesBorne: [
          { type: "qr", ...px(832, 1520, 200, 200) },
          { type: "code-seance", ...px(656, 1770, 154, 28), couleur: "#f0c400", align: "left" },
        ],
      },
    ],
  },
  {
    id: "polaroid",
    formatBoothId: 4,
    name: "Polaroid",
    poses: "1 pose",
    aspectRatio: 1240 / 1844,
    widthPx: 1240,
    heightPx: 1844,
    orientation: "portrait",
    gabarits: [
      {
        id: "pol-1",
        name: "Polaroid classique",
        photoZones: [{ x: 8, y: 6, w: 84, h: 70 }],
        textZones: [],
      },
    ],
  },
  {
    id: "carte-postale-multishoot",
    formatBoothId: 5,
    name: "Carte Postale Multishoot",
    poses: "2 à 4 poses",
    aspectRatio: 1844 / 1240,
    widthPx: 1844,
    heightPx: 1240,
    orientation: "landscape",
    gabarits: [
      {
        id: "cpm-2",
        name: "2 photos côte à côte",
        photoZones: [
          { x: 3, y: 5, w: 45, h: 75 },
          { x: 52, y: 5, w: 45, h: 75 },
        ],
        textZones: [],
      },
      {
        id: "cpm-3",
        name: "3 photos en ligne",
        photoZones: [
          { x: 3, y: 5, w: 30, h: 75 },
          { x: 35, y: 5, w: 30, h: 75 },
          { x: 67, y: 5, w: 30, h: 75 },
        ],
        textZones: [],
      },
      {
        id: "cpm-4",
        name: "4 photos en grille",
        photoZones: [
          { x: 3, y: 3, w: 45, h: 44 },
          { x: 52, y: 3, w: 45, h: 44 },
          { x: 3, y: 50, w: 45, h: 44 },
          { x: 52, y: 50, w: 30, h: 44 },
        ],
        textZones: [],
      },
    ],
  },
  {
    id: "polaroid-multishoot",
    formatBoothId: 6,
    name: "Polaroid Multishoot",
    poses: "2 à 4 poses",
    aspectRatio: 1240 / 1844,
    widthPx: 1240,
    heightPx: 1844,
    orientation: "portrait",
    gabarits: [
      {
        id: "polm-2",
        name: "2 photos empilées",
        photoZones: [
          { x: 8, y: 5, w: 84, h: 38 },
          { x: 8, y: 46, w: 84, h: 38 },
        ],
        textZones: [],
      },
      {
        id: "polm-4",
        name: "4 photos en grille",
        photoZones: [
          { x: 5, y: 4, w: 43, h: 38 },
          { x: 52, y: 4, w: 43, h: 38 },
          { x: 5, y: 45, w: 43, h: 38 },
          { x: 52, y: 45, w: 43, h: 38 },
        ],
        textZones: [],
      },
    ],
  },
  {
    id: "carte-paysage-coupon",
    formatBoothId: 7,
    name: "Carte Paysage Coupon",
    poses: "1 pose",
    aspectRatio: 1844 / 1240,
    widthPx: 1844,
    heightPx: 1240,
    orientation: "landscape",
    gabarits: [
      {
        id: "cpc-1",
        name: "Photo + coupon détachable",
        photoZones: [{ x: 3, y: 5, w: 60, h: 90 }],
        textZones: [],
      },
    ],
  },
];

export function getFormatById(id: string): Format | undefined {
  return FORMATS.find((f) => f.id === id);
}

/**
 * Mapping single ↔ multishoot formats.
 * When shoot count crosses 1↔2, auto-switch to the paired format.
 * Both formats in a pair share the same aspect ratio / dimensions.
 */
const FORMAT_PAIRS: [string, string][] = [
  ["carte-postale-paysage", "carte-postale-multishoot"],
  ["polaroid", "polaroid-multishoot"],
];

/**
 * Given a format ID and a shoot count, returns the format that should be
 * active. Returns null if no switch is needed.
 */
export function getAutoSwitchFormat(currentFormatId: string, shootCount: number): Format | null {
  for (const [singleId, multiId] of FORMAT_PAIRS) {
    if (currentFormatId === singleId && shootCount >= 2) {
      return FORMATS.find((f) => f.id === multiId) || null;
    }
    if (currentFormatId === multiId && shootCount <= 1) {
      return FORMATS.find((f) => f.id === singleId) || null;
    }
  }
  return null;
}

export function getGabaritById(formatId: string, gabaritId: string): Gabarit | undefined {
  const format = getFormatById(formatId);
  return format?.gabarits.find((g) => g.id === gabaritId);
}
