const euroFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euroRondFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const nombreFmt = new Intl.NumberFormat("fr-FR");
const pctFmt = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

export const euros = (cents: number) => euroFmt.format(cents / 100);
export const eurosRond = (cents: number) => euroRondFmt.format(cents / 100);
export const nombre = (n: number) => nombreFmt.format(n);
export const pct = (x: number) => pctFmt.format(x);

/** Variation relative ; null si la référence est nulle (pas de comparaison possible). */
export const variation = (courant: number, reference: number) =>
  reference ? (courant - reference) / reference : null;

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
const dateHeureFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** Instant ISO → date/heure de Paris */
export const dateHeure = (iso: string | null | undefined) => (iso ? dateHeureFmt.format(new Date(iso)) : "—");
export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
/** "2026-10-05" → "05/10/2026" (date métier, sans fuseau) */
export const jour = (ymd: string) => ymd.split("-").reverse().join("/");

export const JOURS_SEMAINE = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const JOURS_COURTS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const MOYENS: Record<string, string> = {
  CB: "Carte (insérée)",
  SANS_CONTACT: "Sans contact",
  ESPECES: "Espèces",
  MOBILE: "Mobile",
  WEB: "QR (paiement web)",
  AUCUN: "Gratuit",
  AUTRE: "Autre",
};

/** "il y a 3 h" — pour l'état des bornes */
export function depuis(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < -5) return "date future (horloge borne ?)";
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
