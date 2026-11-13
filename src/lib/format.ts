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
const partiesParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
/** Jour, date et heure de Paris d'un instant */
function enParis(d: Date) {
  const p = Object.fromEntries(partiesParis.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    jourSemaine: p.weekday,
    date: `${p.day}/${p.month}/${p.year}`,
    // Jour de calendrier de Paris, en jours depuis 1970 (sans heure : ignore les changements d'heure)
    numeroJour: Date.UTC(2000 + Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000,
    heure: Number(p.hour),
    minute: Number(p.minute),
  };
}
/** « 22h », « 23h30 » */
const heureCourte = (h: number, m: number) => `${h}h${m ? String(m).padStart(2, "0") : ""}`;

/**
 * Instant à venir, lu d'un coup d'œil (retour de Sébastien du 10/11) : « dans 5 h (22h) » dans les 12 heures,
 * « demain 23h30 », « mercredi 23h30 » dans la semaine, sinon la date seule « 19/11/26 ».
 */
export function prochainement(iso: string | null | undefined, maintenant = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ecart = d.getTime() - maintenant.getTime();
  const p = enParis(d);
  const heure = heureCourte(p.heure, p.minute);
  if (ecart <= 0) return `à ${heure}`;
  if (ecart < 12 * 3600_000) {
    const minutes = Math.round(ecart / 60_000);
    return `dans ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`} (${heure})`;
  }
  const jours = p.numeroJour - enParis(maintenant).numeroJour;
  if (jours <= 0) return `à ${heure}`;
  if (jours === 1) return `demain ${heure}`;
  if (jours < 7) return `${p.jourSemaine} ${heure}`;
  return p.date;
}

/** "2026-10-05" → "05/10/2026" (date métier, sans fuseau) */
export const jour = (ymd: string) => ymd.split("-").reverse().join("/");

export const JOURS_SEMAINE = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const JOURS_COURTS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const MOYENS: Record<string, string> = {
  CB: "CB · carte insérée",
  // Le terminal ne distingue pas une carte d'un téléphone en sans contact (avenant ventes n° 2)
  SANS_CONTACT: "CB · sans contact (carte ou téléphone)",
  ESPECES: "Espèces",
  MOBILE: "Téléphone",
  WEB: "Paiement en ligne (QR)",
  // Photo validée sans passer par un paiement (mode gratuit, code staff, sans tirage…) : pas une vente (retour de Sébastien)
  AUCUN: "Sans action",
  // Paiement par le terminal sans ticket rapproché : refus, annulation, expiration ou journal indisponible
  AUTRE: "Ticket non retrouvé",
};

// Carte insérée et sans contact : le même paiement bancaire par le terminal (Hexapay) ; le détail est un sous-filtre
export const CARTE_BANCAIRE = ["CB", "SANS_CONTACT"];
export const OPTIONS_MOYENS = [
  { value: CARTE_BANCAIRE.join(","), label: "Carte bancaire (terminal)" },
  { value: "CB", label: "  · carte insérée" },
  { value: "SANS_CONTACT", label: "  · sans contact" },
  // Pas d'espèces : les bornes ne les gèrent pas (retour de Sébastien)
  // Ni espèces (non gérées) ni téléphone (jamais envoyé : le terminal le voit comme du sans contact)
  ...["WEB", "AUCUN", "AUTRE"].map((m) => ({ value: m, label: MOYENS[m] })),
];

/**
 * Moyen de paiement affiché : sans ticket du terminal (AUTRE), une vente annulée ou refusée n'a pas de moyen
 * connu (« — ») ; « Ticket non retrouvé » ne garde son sens que pour une vente acceptée.
 */
export const libelleMoyen = (moyen: string, statut: string) => (moyen === "AUTRE" && statut !== "ACCEPTEE" ? "—" : (MOYENS[moyen] ?? moyen));

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

/** Motif d'une séance à 0 € (champ gratuite des ventes) */
export const GRATUITES: Record<string, string> = {
  MODE_GRATUIT: "mode gratuit",
  CODE_STAFF: "code staff",
  DEGRADE: "terminal en panne",
  REIMPRESSION: "réimpression",
  SANS_TIRAGE: "sans tirage",
};

/** Parc d'un lieu ou d'une borne (les stats montrent le parc Selfizee par défaut) */
export const PARCS: Record<string, string> = { SELFIZEE: "Parc Selfizee", CLIENT: "Parc client", TEST: "Parc test" };

/**
 * Met un paramètre dans l'adresse sans recharger la page (onglet, étape, rubrique) :
 * le lien copié depuis le navigateur rouvre au même endroit. null : retire le paramètre.
 */
export function parametreUrl(cle: string, valeur: string | null) {
  const url = new URL(window.location.href);
  if (valeur === null) url.searchParams.delete(cle);
  else url.searchParams.set(cle, valeur);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Téléphone enregistré en E.164 (« +33669045935 ») → lisible : « +33 6 69 04 59 35 » pour la France, « +971 501234567 »
 * ailleurs (indicatif séparé). Un numéro ancien, pas encore normalisé, est rendu tel quel.
 */
export function telephoneLisible(t: string | null | undefined): string {
  if (!t) return "";
  const fr = /^\+33([1-9])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(t);
  if (fr) return `+33 ${fr.slice(1).join(" ")}`;
  if (!/^\+\d{7,15}$/.test(t)) return t;
  // Indicatif : 1 chiffre (1, 7), 3 chiffres pour ces débuts (212 Maroc, 971 Émirats…), 2 sinon (44, 32…)
  const longueur = /^[17]/.test(t.slice(1)) ? 1 : /^(2[1-689]|3[578]|42|5[09]|6[789]|8[578]|9[679])/.test(t.slice(1)) ? 3 : 2;
  return `+${t.slice(1, 1 + longueur)} ${t.slice(1 + longueur)}`;
}
