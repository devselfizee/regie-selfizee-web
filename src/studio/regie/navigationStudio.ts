"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Étapes du studio dans l'adresse (?depart=…&format=…&etape=…) : chaque étape est une entrée de l'historique, le
// bouton « retour » du navigateur revient donc à l'étape d'avant (retour du 12/11), et un lien copié rouvre la même
// étape. Seuls les choix qui tiennent dans l'adresse y vont ; le reste (format du studio choisi…) reste en mémoire,
// et une étape qui en dépend retombe sur la précédente après un rechargement.

export function useNavigationStudio() {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  return {
    lire: (cle: string) => params.get(cle),
    /**
     * Nouvelle entrée de l'historique avec ces paramètres (null : retiré), les autres gardés ; `remplacer` : à la
     * place de l'entrée courante (étape sautée automatiquement : le retour ne doit pas y ramener).
     */
    aller: (valeurs: Record<string, string | null>, remplacer = false) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(valeurs)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      const q = p.toString();
      const url = q ? `${chemin}?${q}` : chemin;
      if (remplacer) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
  };
}
