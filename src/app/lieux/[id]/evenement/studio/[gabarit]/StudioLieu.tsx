"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, ErreurApi, type FicheEvenementLieu, type GabaritEvenement } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Chargement, Erreur } from "@/components/Etat";
import { StudioRegie, type CadreARouvrir } from "@/studio/regie/StudioRegie";

export function StudioLieu({ lieuId, gabarit }: { lieuId: number; gabarit: GabaritEvenement }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Chargeur lieuId={lieuId} gabarit={gabarit} />
    </Reserve>
  );
}

function Chargeur({ lieuId, gabarit }: { lieuId: number; gabarit: GabaritEvenement }) {
  const fiche = useQuery({ queryKey: ["evenement-lieu", lieuId], queryFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement`) });
  // Pas encore de cadre pour ce gabarit : on part de zéro
  const cadre = useQuery({
    queryKey: ["cadre-evenement", lieuId, gabarit],
    queryFn: () =>
      api<CadreARouvrir>(`/lieux/${lieuId}/evenement/cadres/${gabarit}`).catch((e) => {
        if (e instanceof ErreurApi && e.status === 404) return null;
        throw e;
      }),
    // Le studio garde son propre état : ne pas le remonter sur un rafraîchissement en arrière-plan
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (fiche.error || cadre.error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10">
        <Erreur erreur={fiche.error ?? cadre.error} />
        <Link href={`/lieux/${lieuId}/evenement?ecran=gabarits`} className="bouton-second">← Fiche événement</Link>
      </div>
    );
  }
  if (!fiche.data || cadre.data === undefined) return <Chargement />;
  return <StudioRegie lieuId={lieuId} gabarit={gabarit} nomLieu={fiche.data.reglages.lieu.nom} cadre={cadre.data} />;
}
