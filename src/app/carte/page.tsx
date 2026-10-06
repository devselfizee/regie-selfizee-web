"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { euros, eurosRond, jour, pct } from "@/lib/format";
import { Reserve, useMoi } from "@/lib/session";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { CarteLieux, type PointCarte } from "@/components/CarteLieux";
import { Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

interface LieuCarte {
  lieuId: number;
  enseigne: string;
  ville: string | null;
  typeLieu: string;
  latitude: number | null;
  longitude: number | null;
  caTtcCents: number;
  nbVentes: number;
  joursOuverts: number;
  caParJourOuvertCents: number | null;
  caPrecedentCents: number;
  evolution: number | null;
}

type Mesure = "ca" | "caJourOuvert" | "evolution";
const MESURES: { cle: Mesure; libelle: string; aide: string }[] = [
  { cle: "ca", libelle: "CA de la période", aide: "Chiffre d'affaires TTC sur la période" },
  { cle: "caJourOuvert", libelle: "CA par jour ouvert", aide: "Compare équitablement lieux annuels et saisonniers" },
  { cle: "evolution", libelle: "Évolution", aide: "Par rapport à la période précédente de même durée" },
];

// Échelle séquentielle (une teinte, du clair au foncé) pour les montants ; gris : aucune vente
const SEQUENTIELLE = ["#9ec5f4", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"];
const SANS_VENTE = "#a9a7a0";
// Échelle divergente : baisse (rouge) ↔ stable (gris) ↔ hausse (bleu)
const DIVERGENTE = [
  { max: -0.3, couleur: "#b42626", libelle: "Baisse > 30 %" },
  { max: -0.1, couleur: "#e66767", libelle: "Baisse 10–30 %" },
  { max: 0.1, couleur: "#a9a7a0", libelle: "Stable (± 10 %)" },
  { max: 0.3, couleur: "#5598e7", libelle: "Hausse 10–30 %" },
  { max: Infinity, couleur: "#1c5cab", libelle: "Hausse > 30 %" },
];

export default function PageCarte() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Carte />
    </Reserve>
  );
}

function Carte() {
  const moi = useMoi();
  const router = useRouter();
  const client = useQueryClient();
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const [mesure, setMesure] = useState<Mesure>("ca");
  const query = qs({ ...filtres, granularite: undefined });
  const { data, error, isPending } = useQuery({
    queryKey: ["carte", query],
    queryFn: () => api<{ periode: { du: string; au: string }; lieux: LieuCarte[] }>(`/stats/carte${query}`),
    placeholderData: keepPreviousData,
  });
  const geocoder = useMutation({
    mutationFn: () => api<{ places: number; introuvables: string[] }>("/lieux/geocoder", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["carte"] }),
  });

  const valeur = (l: LieuCarte) =>
    mesure === "ca" ? l.caTtcCents : mesure === "caJourOuvert" ? l.caParJourOuvertCents : l.evolution;

  // Classes de l'échelle séquentielle : quintiles des lieux qui ont vendu
  const { points, legende } = useMemo(() => {
    const lieux = data?.lieux ?? [];
    const places = lieux.filter((l) => l.latitude !== null && l.longitude !== null);
    if (mesure === "evolution") {
      const couleur = (v: number | null) => (v === null ? SANS_VENTE : DIVERGENTE.find((c) => v <= c.max)!.couleur);
      return {
        points: places.map((l) => point(l, couleur(l.evolution))),
        legende: [...DIVERGENTE.map((c) => ({ couleur: c.couleur, libelle: c.libelle })), { couleur: SANS_VENTE, libelle: "Pas de comparaison", vide: true }],
      };
    }
    const valeurs = lieux.map(valeurSeq).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    const bornes = [0.2, 0.4, 0.6, 0.8].map((q) => valeurs[Math.floor(q * valeurs.length)] ?? 0);
    const classe = (v: number) => bornes.filter((b) => v > b).length;
    const fmt = (c: number) => eurosRond(c);
    return {
      points: places.map((l) => {
        const v = valeurSeq(l);
        return point(l, !v ? SANS_VENTE : SEQUENTIELLE[classe(v)]);
      }),
      legende: valeurs.length
        ? [
            ...SEQUENTIELLE.map((couleur, i) => ({
              couleur,
              libelle: i === 0 ? `≤ ${fmt(bornes[0])}` : i === 4 ? `> ${fmt(bornes[3])}` : `${fmt(bornes[i - 1])} – ${fmt(bornes[i])}`,
            })),
            { couleur: SANS_VENTE, libelle: "Aucune vente" },
          ]
        : [{ couleur: SANS_VENTE, libelle: "Aucune vente" }],
    };

    function valeurSeq(l: LieuCarte) {
      return mesure === "ca" ? l.caTtcCents : l.caParJourOuvertCents;
    }
    function point(l: LieuCarte, couleur: string): PointCarte {
      return {
        id: l.lieuId,
        latitude: l.latitude!,
        longitude: l.longitude!,
        couleur,
        titre: l.enseigne,
        lignes: [
          [l.typeLieu, l.ville].filter(Boolean).join(" · "),
          `CA : ${euros(l.caTtcCents)} (${l.nbVentes} ventes)`,
          l.caParJourOuvertCents !== null ? `Par jour ouvert : ${euros(l.caParJourOuvertCents)} (${l.joursOuverts} j)` : "Aucun jour ouvert sur la période",
          l.evolution !== null ? `Évolution : ${l.evolution > 0 ? "+" : ""}${pct(l.evolution)}` : "Évolution : pas de comparaison",
        ],
      };
    }
  }, [data, mesure]);

  const sansPosition = data?.lieux.filter((l) => l.latitude === null || l.longitude === null) ?? [];
  const tries = [...(data?.lieux ?? [])].sort((a, b) => (valeur(b) ?? -Infinity) - (valeur(a) ?? -Infinity));

  return (
    <>
      <EnTete
        titre="Carte des lieux"
        sousTitre={data ? `Du ${jour(data.periode.du)} au ${jour(data.periode.au)} · cliquez sur un lieu pour ouvrir sa fiche` : undefined}
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />

      <div className="mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="Couleur selon">
        <span className="mr-2 text-sm text-ink-2">Couleur selon :</span>
        {MESURES.map((m) => (
          <button
            key={m.cle}
            title={m.aide}
            onClick={() => setMesure(m.cle)}
            className={`rounded-md px-3 py-2 text-sm ${mesure === m.cle ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}
          >
            {m.libelle}
          </button>
        ))}
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && (
        <div className="space-y-4">
          <CarteLieux points={points} onClic={(id) => router.push(`/lieux/${id}`)} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Légende">
            {legende.map((l) => (
              <li key={l.libelle} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border-2"
                  style={"vide" in l && l.vide ? { borderColor: l.couleur } : { background: l.couleur, borderColor: "#fff" }}
                />
                {l.libelle}
              </li>
            ))}
          </ul>

          {sansPosition.length > 0 && (
            <div className="rounded-md bg-warn-bg px-4 py-3 text-sm text-warn-ink">
              {sansPosition.length} lieu(x) sans position, donc absent(s) de la carte : {sansPosition.map((l) => l.enseigne).join(", ")}.
              {moi.role === "ADMIN" ? (
                <button className="ml-2 font-medium underline" disabled={geocoder.isPending} onClick={() => geocoder.mutate()}>
                  {geocoder.isPending ? "Localisation…" : "Les placer d'après leur adresse"}
                </button>
              ) : (
                " Renseignez leur adresse dans la fiche."
              )}
              {geocoder.data && (
                <div className="mt-1">
                  {geocoder.data.places} lieu(x) placé(s).
                  {geocoder.data.introuvables.length > 0 && <> Adresse introuvable ou manquante : {geocoder.data.introuvables.join(", ")}.</>}
                </div>
              )}
            </div>
          )}

          <Section titre="Les mêmes données en tableau">
            {tries.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-2">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Lieu</th>
                      <th className="py-2 pr-3 text-right font-medium">CA</th>
                      <th className="py-2 pr-3 text-right font-medium">Par jour ouvert</th>
                      <th className="py-2 text-right font-medium">Évolution</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {tries.map((l) => (
                      <tr key={l.lieuId} className="border-t border-line">
                        <td className="py-2 pr-3">
                          <Link className="font-medium hover:underline" href={`/lieux/${l.lieuId}`}>{l.enseigne}</Link>
                          <span className="text-xs text-ink-muted"> · {[l.typeLieu, l.ville].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">{euros(l.caTtcCents)}</td>
                        <td className="py-2 pr-3 text-right">{l.caParJourOuvertCents !== null ? euros(l.caParJourOuvertCents) : "—"}</td>
                        <td className={`py-2 text-right ${l.evolution === null ? "text-ink-muted" : l.evolution >= 0 ? "text-good" : "text-bad"}`}>
                          {l.evolution === null ? "—" : `${l.evolution > 0 ? "▲ +" : l.evolution < 0 ? "▼ " : ""}${pct(l.evolution)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide>Aucun lieu actif.</Vide>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
