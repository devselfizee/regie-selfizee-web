import type { Granularite, PointSerie } from "./api";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Début de période (même découpage que date_trunc côté SQL ; semaines ISO, du lundi). */
function debutPeriode(d: Date, g: Granularite): Date {
  if (g === "jour") return d;
  if (g === "semaine") return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  if (g === "mois") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function suivante(d: Date, g: Granularite): Date {
  if (g === "jour") return new Date(d.getTime() + 86_400_000);
  if (g === "semaine") return new Date(d.getTime() + 7 * 86_400_000);
  if (g === "mois") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
}

/** Toutes les périodes entre du et au : les périodes sans vente apparaissent à 0. */
export function periodesDe(du: string, au: string, g: Granularite): string[] {
  const fin = new Date(`${au}T00:00:00Z`);
  const res: string[] = [];
  for (let d = debutPeriode(new Date(`${du}T00:00:00Z`), g); d <= fin && res.length < 2000; d = suivante(d, g)) {
    res.push(ymd(d));
  }
  return res;
}

export function completer(periodes: string[], serie: PointSerie[]) {
  const parPeriode = new Map(serie.map((p) => [p.periode, p]));
  return periodes.map((p) => parPeriode.get(p) ?? { periode: p, caTtcCents: 0, nbVentes: 0 });
}

const moisFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });

export function libellePeriode(p: string, g: Granularite): string {
  const [a, m, j] = p.split("-");
  if (g === "jour") return `${j}/${m}`;
  // Semaine du lundi au dimanche : « 19/10–25/10 »
  if (g === "semaine") {
    const fin = new Date(new Date(`${p}T00:00:00Z`).getTime() + 6 * 86_400_000);
    return `${j}/${m}–${String(fin.getUTCDate()).padStart(2, "0")}/${String(fin.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (g === "mois") return moisFmt.format(new Date(`${p}T00:00:00Z`));
  return a;
}

const jourSemaineFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });

/** Titre de l'infobulle : « 24/10 » et « vendredi » (jour), « Semaine du 19/10 au 25/10 »… */
export function titrePeriode(p: string, g: Granularite): { titre: string; droite?: string } {
  if (g === "jour") {
    const nom = jourSemaineFmt.format(new Date(`${p}T00:00:00Z`));
    return { titre: libellePeriode(p, g), droite: nom.charAt(0).toUpperCase() + nom.slice(1) };
  }
  if (g === "semaine") {
    const [debut, fin] = libellePeriode(p, g).split("–");
    return { titre: `Semaine du ${debut} au ${fin}` };
  }
  return { titre: libellePeriode(p, g) };
}
