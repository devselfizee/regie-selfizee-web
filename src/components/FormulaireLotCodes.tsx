"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { jour, nombre } from "@/lib/format";
import { Erreur } from "./Etat";
import { ChoixLieu } from "./ChoixLieu";

// Génération d'un lot de codes de remise : page Codes et fiche du lieu (onglet Codes promo, retour de Sébastien du 27/11/2026)

export const remise = (c: { type: "OFFERT" | "POURCENTAGE"; pourcentage: number | null; quantite: number }) =>
  c.type === "OFFERT"
    ? `${c.quantite} impression${c.quantite > 1 ? "s" : ""} offerte${c.quantite > 1 ? "s" : ""}`
    : `−${c.pourcentage} % sur la commande${c.quantite > 1 ? `, ${c.quantite} utilisations` : ""}`;

const dansUnAn = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/** Génère un lot de codes. lieuFixe (fiche du lieu) : codes donnés à ce lieu, sans choix du lieu. */
export function FormulaireLot({ lieux = [], lieuFixe, onCree }: { lieux?: LieuListe[]; lieuFixe?: number; onCree: (lotId: number) => void }) {
  const client = useQueryClient();
  const [nbCodes, setNbCodes] = useState("10");
  // Code au nom choisi (« ENZO ») : un seul code (demande de Sébastien du 27/11/2026)
  const [code, setCode] = useState("");
  const codeChoisi = code.toUpperCase().replace(/[\s-]/g, "");
  const [libelle, setLibelle] = useState("");
  const [type, setType] = useState<"OFFERT" | "POURCENTAGE">("OFFERT");
  const [quantite, setQuantite] = useState("1");
  const [pourcentage, setPourcentage] = useState("30");
  const [lieuId, setLieuId] = useState(lieuFixe ? String(lieuFixe) : "");
  const [seulementLieu, setSeulementLieu] = useState(!!lieuFixe);
  const [expireLe, setExpireLe] = useState(dansUnAn);
  const creer = useMutation({
    mutationFn: () =>
      api<{ lotId: number; codesCrees: number }>("/codes-remise/lots", {
        method: "POST",
        json: {
          nbCodes: codeChoisi ? 1 : Number(nbCodes),
          code: codeChoisi || undefined,
          libelle: libelle.trim() || undefined,
          type,
          quantite: Number(quantite),
          pourcentage: type === "POURCENTAGE" ? Number(pourcentage) : undefined,
          lieuId: lieuId ? Number(lieuId) : null,
          seulementLieu: !!lieuId && seulementLieu,
          expireLe,
        },
      }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["codes-remise"] });
      // Le lot apparaît dans la timeline et sur la fiche du lieu
      client.invalidateQueries({ queryKey: ["suivi"] });
      client.invalidateQueries({ queryKey: ["lieu"] });
      onCree(r.lotId);
    },
  });
  const apercu = remise({ type, pourcentage: Number(pourcentage) || 0, quantite: Number(quantite) || 0 });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        creer.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Code choisi</span>
          <input
            className="champ font-mono uppercase tracking-wider"
            maxLength={20}
            pattern="[A-Za-z0-9 \-]{3,24}"
            placeholder="Vide : codes au hasard"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <span className="mt-1 block text-xs text-ink-muted">Ex. ENZO : 3 à 20 lettres ou chiffres, un seul code.</span>
        </label>
        <label className="block">
          <span className="etiquette">Nombre de codes *</span>
          <input className="champ" type="number" min={1} max={1000} required disabled={!!codeChoisi} value={codeChoisi ? "1" : nbCodes} onChange={(e) => setNbCodes(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="etiquette">Nom du lot</span>
          <input className="champ" maxLength={120} placeholder="Offerts au Satori, soirée d'ouverture…" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="etiquette">Remise *</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="type" checked={type === "OFFERT"} onChange={() => setType("OFFERT")} /> Impressions offertes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="type" checked={type === "POURCENTAGE"} onChange={() => setType("POURCENTAGE")} /> Remise en %
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          {/* Remise en % : sur toute la commande, on choisit combien de fois le code sert (retour de Sébastien du 16/11) */}
          <span className="etiquette">{type === "OFFERT" ? "Impressions par code *" : "Utilisations par code *"}</span>
          <input className="champ" type="number" min={1} max={1000} required value={quantite} onChange={(e) => setQuantite(e.target.value)} />
        </label>
        {type === "POURCENTAGE" && (
          <label className="block">
            <span className="etiquette">Remise (%) *</span>
            <input className="champ" type="number" min={1} max={99} required value={pourcentage} onChange={(e) => setPourcentage(e.target.value)} />
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {!lieuFixe && (
          <div className="block">
            <span className="etiquette">Donnés à un lieu</span>
            <ChoixLieu id="lot-lieu" lieux={lieux} valeur={lieuId} onChange={setLieuId} tous="Aucun" />
          </div>
        )}
        <label className="block">
          <span className="etiquette">Valables jusqu&apos;au *</span>
          <input className="champ" type="date" required value={expireLe} onChange={(e) => setExpireLe(e.target.value)} />
        </label>
      </div>
      <fieldset className="space-y-2" disabled={!lieuId}>
        <legend className="etiquette">Utilisables</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="portee" checked={!seulementLieu || !lieuId} onChange={() => setSeulementLieu(false)} /> Sur toutes nos bornes en régie
        </label>
        <label className={`flex items-center gap-2 text-sm ${lieuId ? "" : "text-ink-muted"}`}>
          <input type="radio" name="portee" checked={seulementLieu && !!lieuId} onChange={() => setSeulementLieu(true)} /> Seulement sur les bornes de ce lieu
        </label>
      </fieldset>

      <p className="text-sm text-ink-2">
        {codeChoisi ? <>Le code <span className="font-mono font-medium">{codeChoisi}</span></> : <>{nombre(Number(nbCodes) || 0)} code{Number(nbCodes) > 1 ? "s" : ""} de 5 caractères</>} · {apercu} chacun · jusqu&apos;au {expireLe ? jour(expireLe) : "—"}.
      </p>
      {creer.error && <Erreur erreur={creer.error} />}
      <button className="bouton" disabled={creer.isPending}>{creer.isPending ? "Génération…" : "Générer"}</button>
    </form>
  );
}
