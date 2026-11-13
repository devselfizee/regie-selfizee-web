"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ErreurApi } from "@/lib/api";
import { useMoi } from "@/lib/session";

/**
 * Supprimer un lieu ou une borne : super admin seulement. Rien n'est effacé (marque de suppression) ;
 * l'élément sort des listes et des chiffres (demande du 13/11).
 */
export function BoutonSupprimer({ chemin, quoi, nom, retour }: { chemin: string; quoi: "le lieu" | "la borne"; nom: string; retour: string }) {
  const moi = useMoi();
  const router = useRouter();
  const client = useQueryClient();
  const supprimer = useMutation({
    mutationFn: () => api(chemin, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries();
      router.push(retour);
    },
    onError: (e) => alert(e instanceof ErreurApi ? e.message : "La suppression a échoué."),
  });
  if (!moi.superAdmin) return null;
  return (
    <button
      type="button"
      className="bouton-second !text-bad"
      disabled={supprimer.isPending}
      onClick={() => {
        if (confirm(`Supprimer ${quoi} « ${nom} » ?\n\nIl disparaît des listes et ses ventes ne comptent plus dans les chiffres. Les données restent en base.`)) supprimer.mutate();
      }}
    >
      {supprimer.isPending ? "Suppression…" : "Supprimer"}
    </button>
  );
}
