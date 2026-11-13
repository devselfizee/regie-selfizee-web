"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, libelleTypeMedia, qs, type PageMedias } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { EnTete } from "@/components/Etat";
import { FiltresPage, useFiltresPage } from "@/components/FiltresPage";
import { GrilleMedias, PAR_PAGE } from "@/components/GalerieMedias";

// Page « Photos » du menu (retour du 13/11) : les dernières photos et vidéos de toutes les bornes, tous lieux confondus,
// avec les filtres habituels (parc, lieu, période) et ceux de la galerie (type, ventes, séances de test). Les lieux
// visibles suivent les droits : tous, ceux du commercial, ou le lieu du partenaire. Un clic sur le lieu ouvre ses photos.

export default function PagePhotos() {
  return (
    <PageGuard perm="medias.view">
      <Photos />
    </PageGuard>
  );
}

function Photos() {
  const f = useFiltresPage("7j");
  const [type, setType] = useState("");
  const [vente, setVente] = useState("");
  const [tests, setTests] = useState(false);
  const [page, setPage] = useState(1);
  const filtres = { du: f.du, au: f.au, parc: f.parc, lieuId: f.lieuId, type, vente, tests: tests ? "1" : "", page, parPage: PAR_PAGE };
  const liste = useQuery({
    queryKey: ["photos", filtres],
    queryFn: () => api<PageMedias>(`/medias${qs(filtres)}`),
    placeholderData: keepPreviousData,
  });
  // Tout changement de filtre repart de la première page
  const changer = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const filtresPage = { ...f, set: (m: Parameters<typeof f.set>[0]) => changer(f.set)(m) };

  return (
    <>
      <EnTete
        titre="Photos"
        sousTitre={`${f.du === f.au ? `Le ${jour(f.du)}` : `Du ${jour(f.du)} au ${jour(f.au)}`}${liste.isFetching ? " · mise à jour…" : ""}`}
        actions={<FiltresPage f={filtresPage} prefixe="photos" />}
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-end gap-3">
          <label className="block w-48">
            <span className="etiquette">Type</span>
            <select id="photos-type" className="champ" value={type} onChange={(e) => changer(setType)(e.target.value)}>
              <option value="">Tous</option>
              {(liste.data?.types ?? []).map((t) => (
                <option key={t} value={t}>
                  {libelleTypeMedia(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-48">
            <span className="etiquette">Ventes</span>
            <select id="photos-vente" className="champ" value={vente} onChange={(e) => changer(setVente)(e.target.value)}>
              <option value="">Toutes les séances</option>
              <option value="payee">Séances payées</option>
              <option value="sans">Sans vente</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input id="photos-tests" type="checkbox" checked={tests} onChange={(e) => changer(setTests)(e.target.checked)} />
            Montrer les séances de test
          </label>
        </div>
        <GrilleMedias
          liste={liste}
          page={page}
          setPage={setPage}
          avecLieu
          vide="Aucune photo sur cette période avec ces filtres. Les photos arrivent quelques minutes après chaque séance sur la borne."
        />
      </div>
    </>
  );
}
