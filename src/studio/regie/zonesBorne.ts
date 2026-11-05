// Zones remplies par la borne au moment de la photo, posées au studio comme des éléments du cadre :
// QR code (lien de la page souvenir), code photo (le code de séance, qui sert à réimprimer : `sessionCode`),
// date / heure de la prise de vue. Dans l'éditeur, elles se distinguent des textes ordinaires : contour
// ambre en pointillés et étiquette « ⚡ DATE », « ⚡ CODE PHOTO »…, par-dessus tout le canvas (jamais
// exportés). Elles ne sont pas
// dans l'image du cadre (masquées à l'export, voir useCanvasExport) : l'API lit leur position et leur
// style dans le canvas enregistré et les écrit dans le config.json (`qrHoles`, `sessionCode`, et
// `dynamicTexts` au format que la borne lit déjà — regie-selfizee-api src/config-evenement/composition.ts).

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
  "code-seance": "Code photo",
  date: "Date",
  heure: "Heure",
  "date-heure": "Date et heure",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const estZoneBorne = (o: any): boolean => Boolean(o?._zoneBorne);

// Repère des zones dynamiques dans l'éditeur : ambre, pour ne pas les confondre avec un texte ordinaire
// ni avec la sélection (indigo)
const AMBRE = "#f59e0b";
const FOND_REPERE = "rgba(245, 158, 11, 0.2)";
const ETIQUETTES: Record<TypeZoneBorne, string> = {
  qr: "QR CODE",
  "code-seance": "CODE PHOTO",
  date: "DATE",
  heure: "HEURE",
  "date-heure": "DATE ET HEURE",
};

/**
 * Contour pointillé et étiquette « ⚡ … » au-dessus de la zone, à taille constante à l'écran, dans le repère
 * de l'objet (ctx déjà transformé).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dessinerRepere(o: any, ctx: CanvasRenderingContext2D) {
  const w = o.width ?? 0;
  const h = o.height ?? 0;
  const zoom = o.canvas?.getZoom?.() || 1;
  const sx = Math.abs(o.scaleX ?? 1) || 1;
  const sy = Math.abs(o.scaleY ?? 1) || 1;
  const px = 1 / zoom;
  ctx.save();
  // Sans l'échelle de l'objet : unités = pixels du canvas
  ctx.scale(1 / sx, 1 / sy);
  const l = w * sx;
  const hh = h * sy;
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([5 * px, 3 * px]);
  ctx.strokeStyle = AMBRE;
  ctx.strokeRect(-l / 2, -hh / 2, l, hh);
  ctx.setLineDash([]);
  const taille = 10 * px;
  const marge = 4 * px;
  ctx.font = `700 ${taille}px Arial, sans-serif`;
  const texte = `⚡ ${ETIQUETTES[o._zoneBorne as TypeZoneBorne] ?? "DYNAMIQUE"}`;
  const largeur = ctx.measureText(texte).width + 2 * marge;
  const hauteur = taille + 2 * marge;
  const x = -l / 2;
  const y = -hh / 2 - hauteur - 2 * px;
  ctx.fillStyle = AMBRE;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, largeur, hauteur, 3 * px);
  else ctx.rect(x, y, largeur, hauteur);
  ctx.fill();
  ctx.fillStyle = "#1a1d2b";
  ctx.textBaseline = "middle";
  ctx.fillText(texte, x + marge, y + hauteur / 2 + 0.5 * px);
  ctx.restore();
}

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
  if (o.canvas) installerReperes(o.canvas);
  else o.once?.("added", () => installerReperes(o.canvas));
  if (o._zoneBorne === "qr") {
    // Un QR reste carré et droit (qrHoles n'a pas de rotation)
    o.set({ lockRotation: true, lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true });
    o.setControlsVisibility?.({ mt: false, mb: false, ml: false, mr: false, mtr: false });
  } else {
    // Le texte est écrit par la borne : on règle son style, pas son contenu ; fond ambre (aussi sur les
    // cadres enregistrés avant ce repère)
    o.set({ editable: false, backgroundColor: FOND_REPERE });
    // Rotation libre, comme le code photo : la borne tourne aussi les dates depuis le 05/11/2026
    // (`rotation` des dynamicTexts). Débloquée aussi sur les cadres enregistrés avant
    o.set({ lockRotation: false });
    o.setControlsVisibility?.({ mtr: true });
  }
}

/**
 * Repères des zones dynamiques, dessinés une fois tout le canvas rendu (`after:render` : après les calques,
 * le masque de la page et les poignées) : toujours visibles, même sous un calque ou hors du cadre. Une
 * zone masquée (exports, vignette : `visible` à faux) n'en a pas. Une seule fois par canvas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installerReperes(canvas: any) {
  if (!canvas || canvas.__reperesBorne) return;
  canvas.__reperesBorne = true;
  canvas.on("after:render", ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
    const v = canvas.viewportTransform as number[];
    for (const o of canvas.getObjects()) {
      if (!o._zoneBorne || !o.visible) continue;
      const m = o.calcTransformMatrix() as number[];
      ctx.save();
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      dessinerRepere(o, ctx);
      ctx.restore();
    }
  });
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
    // Comme la borne le pose (mémo du 03/11) : carré blanc à coins arrondis, marge blanche de 1/12 du côté.
    // Sans contour : la taille du groupe est exactement celle de la zone `qrHoles`
    const marge = taille / 12;
    const fond = new fabric.Rect({ left: 0, top: 0, width: taille, height: taille, rx: marge, ry: marge, originX: "left", originY: "top", fill: "#ffffff", strokeWidth: 0 });
    const modules = new fabric.Path(traceQr(taille - 2 * marge), { left: marge, top: marge, originX: "left", originY: "top", fill: "#111827", fillRule: "evenodd", strokeWidth: 0 });
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
