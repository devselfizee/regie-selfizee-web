"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CarteTest } from "@/lib/api";
import { dateHeure, euros, nombre } from "@/lib/format";
import { Chargement, Erreur } from "./Etat";

/**
 * Paramètres : cartes bancaires de test (4 derniers chiffres et un nom). Les ventes payées avec
 * ces cartes sortent des chiffres réels (stats, tableau de bord, commissions, exports) et restent
 * visibles à part (Paiements → « Cartes de test »).
 */
export function CartesTest() {
  const client = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["cartes-test"], queryFn: () => api<CarteTest[]>("/cartes-test") });
  const [message, setMessage] = useState<string | null>(null);
  // Une carte ajoutée ou retirée change les chiffres de toutes les pages
  const fini = (texte: string) => {
    setMessage(texte);
    client.invalidateQueries();
  };

  const ajouter = useMutation({
    mutationFn: (d: { derniersChiffres: string; nom: string }) =>
      api<CarteTest & { ventesMarquees: number }>("/cartes-test", { method: "POST", json: d }),
    onSuccess: (r) => fini(`Carte ${r.derniersChiffres} ajoutée : ${nombre(r.ventesMarquees)} vente(s) déjà reçue(s) passée(s) en test.`),
  });
  const supprimer = useMutation({
    mutationFn: (id: number) => api<{ ventesReintegrees: number }>(`/cartes-test/${id}`, { method: "DELETE" }),
    onSuccess: (r) => fini(`Carte retirée : ${nombre(r.ventesReintegrees)} vente(s) comptée(s) à nouveau dans les chiffres réels.`),
  });

  const total = (data ?? []).reduce((s, c) => ({ nb: s.nb + c.nbVentes, ca: s.ca + c.caTtcCents }), { nb: 0, ca: 0 });

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">Cartes de test</h2>
      <p className="mb-4 text-sm text-ink-2">
        Les cartes bancaires utilisées pour tester les bornes. Leurs ventes (repérées par les 4 derniers chiffres envoyés par la borne) sont
        retirées des chiffres réels : statistiques, tableau de bord, commissions et exports. Elles restent visibles à part dans{" "}
        <Link href="/paiements?cartes=test" className="text-accent hover:underline">
          Paiements → Cartes de test
        </Link>
        . Ajouter une carte s&apos;applique aussi aux ventes déjà reçues.
      </p>

      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && (
        <div className="space-y-4">
          {data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-2">
                    <th className="py-2 pr-3 font-medium">Carte</th>
                    <th className="py-2 pr-3 font-medium">Nom</th>
                    <th className="py-2 pr-3 text-right font-medium">Ventes de test</th>
                    <th className="py-2 pr-3 text-right font-medium">Montant</th>
                    <th className="py-2 pr-3 font-medium">Dernière</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <LigneCarte key={c.id} carte={c} onSupprimer={() => confirm(`Retirer la carte ${c.derniersChiffres} (${c.nom}) ?\n\nSes ${c.nbVentes} vente(s) compteront à nouveau dans les chiffres réels.`) && (setMessage(null), supprimer.mutate(c.id))} onModifiee={fini} />
                  ))}
                </tbody>
                {data.length > 1 && (
                  <tfoot>
                    <tr className="text-ink-2">
                      <td className="py-2 pr-3" colSpan={2}>
                        Total
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{nombre(total.nb)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{euros(total.ca)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {data.length === 0 && <p className="text-sm text-ink-muted">Aucune carte de test pour l&apos;instant.</p>}

          <FormulaireCarte
            libelle="Ajouter la carte"
            enCours={ajouter.isPending}
            onValider={(d) => {
              setMessage(null);
              ajouter.mutate(d);
            }}
            reinitialiser={ajouter.isSuccess}
          />
          {(ajouter.error || supprimer.error) && <Erreur erreur={ajouter.error ?? supprimer.error} />}
          {message && <p className="text-sm text-good">{message}</p>}
          <p className="text-xs text-ink-muted">
            4 chiffres peuvent aussi être ceux d&apos;une vraie carte client : environ une chance sur 10 000 par carte de test. Les ajouts et
            retraits sont tracés dans le journal d&apos;audit.
          </p>
        </div>
      )}
    </section>
  );
}

function LigneCarte({ carte, onSupprimer, onModifiee }: { carte: CarteTest; onSupprimer: () => void; onModifiee: (m: string) => void }) {
  const [edition, setEdition] = useState(false);
  const modifier = useMutation({
    mutationFn: (d: { derniersChiffres: string; nom: string }) =>
      api<CarteTest & { ventesMarquees: number }>(`/cartes-test/${carte.id}`, { method: "PUT", json: d }),
    onSuccess: () => {
      setEdition(false);
      onModifiee(`Carte ${carte.derniersChiffres} modifiée.`);
    },
  });
  if (edition)
    return (
      <tr className="border-b border-line">
        <td colSpan={6} className="py-2">
          <FormulaireCarte
            initial={carte}
            libelle="Enregistrer"
            enCours={modifier.isPending}
            onValider={(d) => modifier.mutate(d)}
            onAnnuler={() => setEdition(false)}
          />
          {modifier.error && <Erreur erreur={modifier.error} />}
        </td>
      </tr>
    );
  return (
    <tr className="border-b border-line">
      <td className="py-2 pr-3 font-mono tabular-nums">•••• {carte.derniersChiffres}</td>
      <td className="py-2 pr-3">{carte.nom}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {carte.nbVentes ? (
          <Link href={`/paiements?cartes=test&q=${carte.derniersChiffres}`} className="text-accent hover:underline">
            {nombre(carte.nbVentes)}
          </Link>
        ) : (
          0
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{euros(carte.caTtcCents)}</td>
      <td className="py-2 pr-3 text-ink-2">{carte.derniereVente ? dateHeure(carte.derniereVente) : "—"}</td>
      <td className="whitespace-nowrap py-2 text-right">
        <button type="button" className="text-sm text-accent hover:underline" onClick={() => setEdition(true)}>
          Modifier
        </button>
        <button type="button" className="ml-3 text-sm text-bad hover:underline" onClick={onSupprimer}>
          Retirer
        </button>
      </td>
    </tr>
  );
}

function FormulaireCarte({
  initial,
  libelle,
  enCours,
  onValider,
  onAnnuler,
  reinitialiser,
}: {
  initial?: { derniersChiffres: string; nom: string };
  libelle: string;
  enCours: boolean;
  onValider: (d: { derniersChiffres: string; nom: string }) => void;
  onAnnuler?: () => void;
  reinitialiser?: boolean;
}) {
  const [chiffres, setChiffres] = useState(initial?.derniersChiffres ?? "");
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [vu, setVu] = useState(reinitialiser);
  // Formulaire d'ajout vidé après un ajout réussi
  if (reinitialiser !== vu) {
    setVu(reinitialiser);
    if (reinitialiser) {
      setChiffres("");
      setNom("");
    }
  }
  const valide = /^\d{4}$/.test(chiffres) && nom.trim().length > 0;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) onValider({ derniersChiffres: chiffres, nom: nom.trim() });
      }}
    >
      <label>
        <span className="etiquette">4 derniers chiffres</span>
        <input
          className="champ !w-28 font-mono tabular-nums"
          inputMode="numeric"
          maxLength={4}
          placeholder="1234"
          value={chiffres}
          onChange={(e) => setChiffres(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </label>
      <label className="min-w-0 flex-1">
        <span className="etiquette">Nom</span>
        <input className="champ w-full" maxLength={120} placeholder="Carte Crédit Agricole Sébastien" value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <button className="bouton" disabled={!valide || enCours}>
        {enCours ? "Enregistrement…" : libelle}
      </button>
      {onAnnuler && (
        <button type="button" className="bouton-second" onClick={onAnnuler}>
          Annuler
        </button>
      )}
    </form>
  );
}
