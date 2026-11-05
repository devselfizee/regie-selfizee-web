import type { GabaritEvenement } from "./api";

// Formats du kit nightlife proposés sur la borne : cartes de la fiche événement et première étape du
// studio (« Ajouter un format »). Même liste que GABARITS côté API (src/config-evenement/reglages.ts).
export const GABARITS: { cle: GabaritEvenement; nom: string; detail: string; qr: boolean }[] = [
  { cle: "bandelette", nom: "Bandelette 4 poses + carte souvenir", detail: "10x15 coupé en deux ; QR et code photo sur la carte.", qr: true },
  {
    cle: "bandelette-couchee",
    nom: "Bandelette couchée 4 poses + carte souvenir",
    detail: "Bande à lire à l'horizontale (photos côte à côte) ; carte souvenir comme la bandelette.",
    qr: true,
  },
  { cle: "pola", nom: "Pola 1 pose", detail: "10x15, une grande photo.", qr: false },
  { cle: "planche", nom: "Planche 4 poses", detail: "10x15, quatre cases carrées.", qr: false },
  { cle: "paysage", nom: "Photo 10x15 paysage", detail: "15x10 à l'horizontale, une photo pleine page.", qr: false },
  { cle: "carte", nom: "Photo 10x15 + deux cartes à QR", detail: "Ruban 15x20 obligatoire ; même QR sur les deux cartes, une pour chaque invité.", qr: true },
];

/** Identifiant d'une nouvelle composition : le nom du gabarit la première fois, puis numéroté au hasard. */
export function nouvelId(g: GabaritEvenement, existants: string[]): string {
  if (!existants.includes(g)) return g;
  for (;;) {
    const id = `${g}-${Math.random().toString(36).slice(2, 6)}`;
    if (!existants.includes(id)) return id;
  }
}
