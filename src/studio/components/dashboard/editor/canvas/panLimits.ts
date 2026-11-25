/**
 * Défilement de la zone de travail quand le visuel zoomé dépasse la fenêtre.
 *
 * Le déplacement (« pan ») est une translation CSS de l'élément
 * `[data-canvas-pan]`, centré dans le conteneur : pan = 0 → visuel centré,
 * pan positif → le visuel part vers la droite / le bas.
 *
 * Le hook `useCanvasInteraction` est le seul à écrire le pan. Les autres
 * (barres de défilement, raccourcis, barre du bas) passent par ces deux
 * événements DOM émis sur le conteneur :
 *  - PAN_EVENT         : le pan vient de changer      (detail : { x, y })
 *  - PAN_REQUEST_EVENT : demande de pan               (detail : { x, y })
 */

export const PAN_EVENT = "studio:pan";
export const PAN_REQUEST_EVENT = "studio:pan-request";

export interface PanExtent {
  /** Taille visible du conteneur (px CSS). */
  viewW: number;
  viewH: number;
  /** Taille affichée du visuel, hors marge de travail (px CSS). */
  contentW: number;
  contentH: number;
  /** Amplitude de défilement par axe : pan ∈ [-ext, +ext]. 0 = tout est visible. */
  extX: number;
  extY: number;
}

/** Amplitude de défilement d'un axe. La marge laisse un peu d'air autour du
 *  visuel en bout de course (et dégage les règles). */
export function scrollExtent(view: number, content: number): number {
  if (view <= 0 || content <= 0) return 0;
  const margin = Math.min(40, view * 0.05);
  const ext = (content - view) / 2 + margin;
  return ext > 0.5 ? ext : 0;
}

export function getPanExtent(
  container: HTMLElement | null,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
): PanExtent {
  const viewW = container?.clientWidth ?? 0;
  const viewH = container?.clientHeight ?? 0;
  const contentW = canvasWidth * scale;
  const contentH = canvasHeight * scale;
  return {
    viewW, viewH, contentW, contentH,
    extX: scrollExtent(viewW, contentW),
    extY: scrollExtent(viewH, contentH),
  };
}

/** Demande un pan au hook d'interaction (ex. { x: 0, y: 0 } pour recentrer). */
export function requestPan(container: HTMLElement | null, x: number, y: number) {
  container?.dispatchEvent(new CustomEvent(PAN_REQUEST_EVENT, { detail: { x, y } }));
}
