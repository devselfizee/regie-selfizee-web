"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Gate } from "@/lib/perms";
import { Erreur } from "@/components/Etat";

// Renommer un code de remise jamais utilisé, par exemple en « ENZO » (demande de Sébastien du 27/11/2026).
// L'API refuse un code déjà utilisé ou gagné à la carte à gratter.

const normaliser = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export function RenommerCode({ id, code, taille = "petit" }: { id: number; code: string; taille?: "petit" | "normal" }) {
  const client = useQueryClient();
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(code);
  const renommer = useMutation({
    mutationFn: () => api(`/codes-remise/${id}/renommer`, { method: "POST", json: { code: normaliser(valeur) } }),
    onSuccess: () => {
      setEdition(false);
      client.invalidateQueries({ queryKey: ["codes-remise"] });
      client.invalidateQueries({ queryKey: ["lieu"] });
    },
  });
  const lien = taille === "petit" ? "text-xs" : "text-sm";
  if (!edition)
    return (
      <Gate perm="codes_remise.edit">
        <button
          type="button"
          className={`${lien} text-accent hover:underline`}
          onClick={(e) => {
            e.stopPropagation();
            setValeur(code);
            renommer.reset();
            setEdition(true);
          }}
        >
          Renommer
        </button>
      </Gate>
    );
  return (
    <form
      className="mt-1 w-full space-y-1"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        renommer.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          className="champ font-mono uppercase tracking-wider"
          autoFocus
          maxLength={20}
          aria-label="Nouveau nom du code"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
        <button type="submit" className="bouton" disabled={renommer.isPending || normaliser(valeur).length < 3}>
          OK
        </button>
        <button type="button" className="text-sm text-ink-2 hover:underline" onClick={() => setEdition(false)}>
          Annuler
        </button>
      </div>
      <p className="text-xs text-ink-muted">3 à 20 lettres ou chiffres. Seulement un code jamais utilisé.</p>
      {renommer.error && <Erreur erreur={renommer.error} />}
    </form>
  );
}
