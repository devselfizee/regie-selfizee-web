// Zones remplies par la borne au moment de la photo, posées au studio comme des éléments du cadre :
// QR code (lien de la page souvenir), code de séance, date / heure de la prise de vue. Elles ne sont pas
// dans l'image du cadre (masquées à l'export, voir useCanvasExport) : l'API lit leur position et leur
// style dans le canvas enregistré et les écrit dans le config.json (`qrHoles`, `sessionCode`,
// `dynamicTexts` — regie-selfizee-api src/config-evenement/composition.ts).

export type TypeZoneBorne = "qr" | "code-seance" | "date" | "heure" | "date-heure";

/** Zone de la borne d'un gabarit du studio, en % de la page comme les zones photo. */
export interface ZoneBorne {
  type: TypeZoneBorne;
  x: number;
  y: number;
  w: number;
  h: number;
  couleur?: string;
  align?: "left" | "center" | "right";
}

export const LIBELLES_ZONES_BORNE: Record<TypeZoneBorne, string> = {
  qr: "QR code",
  "code-seance": "Code de séance",
  date: "Date",
  heure: "Heure",
  "date-heure": "Date et heure",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const estZoneBorne = (o: any): boolean => Boolean(o?._zoneBorne);

// Fond léger des textes de la borne dans l'éditeur : on voit que ce sont des emplacements
const FOND_REPERE = "rgba(79, 70, 229, 0.12)";

/** Le texte d'exemple affiché dans l'éditeur (la borne écrit la vraie valeur). */
function exemple(type: TypeZoneBorne): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  const heure = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (type === "code-seance") return "CODE AB2CD3";
  if (type === "date") return date;
  if (type === "heure") return heure;
  return `${date} ${heure}`;
}

/** Tracé d'un QR d'exemple (21 × 21 modules) : trois repères et des modules réguliers. */
function traceQr(taille: number): string {
  const n = 21;
  const m = taille / n;
  const carre = (x: number, y: number, c: number) => `M${x * m} ${y * m}h${c * m}v${c * m}h${-c * m}z`;
  // Repère : carré 7 évidé de 5, centre de 3 (remplissage pair-impair)
  const repere = (x: number, y: number) => carre(x, y, 7) + carre(x + 1, y + 1, 5) + carre(x + 2, y + 2, 3);
  let d = repere(0, 0) + repere(14, 0) + repere(0, 14);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dansRepere = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
      if (!dansRepere && (i * 7 + j * 13 + i * j) % 3 === 0) d += carre(i, j, 1);
    }
  }
  return d;
}

/** Réglages d'une zone de la borne : à poser à la création et à chaque rechargement du canvas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reglerZoneBorne(o: any) {
  if (o._zoneBorne === "qr") {
    // Un QR reste carré et droit (qrHoles n'a pas de rotation)
    o.set({ lockRotation: true, lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true });
    o.setControlsVisibility?.({ mt: false, mb: false, ml: false, mr: false, mtr: false });
  } else {
    // Le texte est écrit par la borne : on règle son style, pas son contenu
    o.set({ editable: false });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fabric = any;

/** Crée une zone de la borne, coin haut gauche en (left, top), dans le repère du canvas. */
export function creerZoneBorne(
  fabric: Fabric,
  type: TypeZoneBorne,
  { left, top, largeur, hauteur, couleur, align }: { left: number; top: number; largeur: number; hauteur: number; couleur?: string; align?: ZoneBorne["align"] },
) {
  let o;
  if (type === "qr") {
    const taille = Math.min(largeur, hauteur);
    // Sans contour : la taille du groupe est exactement celle du QR
    const fond = new fabric.Rect({ left: 0, top: 0, width: taille, height: taille, originX: "left", originY: "top", fill: "#ffffff", strokeWidth: 0 });
    const modules = new fabric.Path(traceQr(taille), { left: 0, top: 0, originX: "left", originY: "top", fill: "#111827", fillRule: "evenodd", strokeWidth: 0 });
    o = new fabric.Group([fond, modules], { left, top, originX: "left", originY: "top" });
  } else {
    // Hauteur de ligne fabric : 1,16 × la taille de police
    o = new fabric.Textbox(exemple(type), {
      left,
      top,
      originX: "left",
      originY: "top",
      width: largeur,
      fontSize: Math.max(6, hauteur / 1.16),
      // Police toujours disponible (la borne écrit le code avec la sienne ; pour la date, le choix
      // de police fait dans la barre d'outils est transmis à la borne)
      fontFamily: "Arial",
      fontWeight: type === "code-seance" ? "bold" : "600",
      fill: couleur ?? "#111827",
      textAlign: align ?? (type === "code-seance" ? "left" : "center"),
      backgroundColor: FOND_REPERE,
    });
    // Sur une ligne, comme la borne : la police se réduit si le texte déborde en largeur
    while (o.textLines.length > 1 && o.fontSize > 6) {
      o.set({ fontSize: o.fontSize - 0.5 });
      o.initDimensions();
    }
  }
  o._zoneBorne = type;
  reglerZoneBorne(o);
  return o;
}

/** Les zones de la borne d'un gabarit (QR et code de la carte souvenir…), à la création du cadre. */
export function creerZonesBorneDuGabarit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  fabric: Fabric,
  zones: ZoneBorne[] | undefined,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
) {
  for (const z of zones ?? []) {
    canvas.add(
      creerZoneBorne(fabric, z.type, {
        left: BLEED_PX + (z.x / 100) * canvasWidth,
        top: BLEED_PX + (z.y / 100) * canvasHeight,
        largeur: (z.w / 100) * canvasWidth,
        hauteur: (z.h / 100) * canvasHeight,
        couleur: z.couleur,
        align: z.align,
      }),
    );
  }
}

/** Ajout depuis le panneau Textes : au centre de la page, à une taille raisonnable. */
export async function ajouterZoneBorne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  type: TypeZoneBorne,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
) {
  if (!canvas) return;
  const fabric = await import("fabric");
  const cote = Math.min(canvasWidth, canvasHeight);
  const largeur = type === "qr" ? cote * 0.22 : canvasWidth * 0.6;
  const hauteur = type === "qr" ? cote * 0.22 : canvasHeight * 0.035;
  const o = creerZoneBorne(fabric, type, {
    left: BLEED_PX + (canvasWidth - largeur) / 2,
    top: BLEED_PX + (canvasHeight - hauteur) / 2,
    largeur,
    hauteur,
  });
  canvas.add(o);
  canvas.setActiveObject(o);
  canvas.requestRenderAll();
}
