"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type MesMentions } from "@/lib/api";
import { jeton, keycloak } from "@/lib/auth";
import { useMoi } from "@/lib/session";
import { useDroits } from "@/lib/perms";
import { chargerPlateforme, PLATEFORME_URL, type Plateforme, type Racine18 } from "@/lib/plateforme";
import { Navigation } from "./Navigation";

/* eslint-disable @typescript-eslint/no-explicit-any -- composants React 18 chargés à l'exécution */

// Menu de la barre latérale (icônes Lucide), filtré selon les droits Konitys (une clé pages.<x>.view par entrée)
const SECTIONS: { libelle: string; liens: { href: string; libelle: string; icone: string; perm: string }[] }[] = [
  {
    libelle: "Pilotage",
    liens: [
      { href: "/", libelle: "Tableau de bord", icone: "LayoutDashboard", perm: "pages.tableau_de_bord.view" },
      { href: "/lieux/carte", libelle: "Analyse géographique", icone: "Map", perm: "pages.analyse_geo.view" },
      { href: "/analyse", libelle: "Analyse", icone: "ChartColumn", perm: "pages.analyse.view" },
      { href: "/comportements", libelle: "Comportements", icone: "Footprints", perm: "pages.comportements.view" },
      { href: "/alertes", libelle: "Alertes", icone: "Bell", perm: "pages.alertes.view" },
      { href: "/mentions", libelle: "Mes mentions", icone: "AtSign", perm: "pages.mentions.view" },
    ],
  },
  {
    libelle: "Parc",
    liens: [
      { href: "/lieux", libelle: "Lieux", icone: "MapPin", perm: "pages.lieux.view" },
      { href: "/bornes", libelle: "Bornes", icone: "Monitor", perm: "pages.bornes.view" },
      { href: "/monitoring", libelle: "Monitoring live", icone: "Activity", perm: "pages.monitoring.view" },
      { href: "/papier", libelle: "Papier", icone: "Printer", perm: "pages.papier.view" },
      // Journal des bornes et erreurs d'import : techniques, rangés dans « Suivi technique » de la page Bornes
    ],
  },
  {
    libelle: "Argent",
    liens: [
      { href: "/reversements", libelle: "Commissions", icone: "Banknote", perm: "pages.commissions.view" },
      { href: "/paiements", libelle: "Paiements", icone: "Receipt", perm: "pages.paiements.view" },
      { href: "/codes", libelle: "Codes de remise", icone: "Ticket", perm: "pages.codes_remise.view" },
      { href: "/rapprochement", libelle: "Rapprochement", icone: "Scale", perm: "pages.rapprochement.view" },
      { href: "/rentabilite", libelle: "Rentabilité", icone: "TrendingUp", perm: "pages.rentabilite.view" },
    ],
  },
  {
    libelle: "Commercial",
    liens: [{ href: "/prospects", libelle: "Prospects", icone: "Target", perm: "pages.prospects.view" }],
  },
  {
    libelle: "Administration",
    liens: [
      { href: "/utilisateurs", libelle: "Utilisateurs", icone: "Users", perm: "pages.utilisateurs.view" },
      { href: "/parametres", libelle: "Paramètres", icone: "Settings", perm: "pages.parametres.view" },
    ],
  },
];

/** Rend un composant React 18 dans un conteneur à part (îlot), à l'abri du React 19 de l'application. */
function Ilot({ p, composant, proprietes, onErreur }: { p: Plateforme; composant: unknown; proprietes: Record<string, unknown>; onErreur: () => void }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const racine = useRef<Racine18 | null>(null);
  // Garde d'erreur React 18 : un plantage du composant distant bascule sur la navigation locale
  const Garde = useMemo(() => {
    const R = p.React;
    return class extends R.Component {
      state = { erreur: false };
      static getDerivedStateFromError() {
        return { erreur: true };
      }
      componentDidCatch(err: unknown) {
        console.warn("Composant de la plateforme en erreur, navigation locale utilisée :", err);
        (this as any).props.onErreur();
      }
      render() {
        return (this as any).state.erreur ? null : (this as any).props.children;
      }
    };
  }, [p]);

  useEffect(() => {
    racine.current = p.creerRacine(conteneur.current!);
    return () => {
      const r = racine.current;
      racine.current = null;
      setTimeout(() => r?.unmount()); // pas pendant le rendu React 19
    };
  }, [p]);

  useEffect(() => {
    racine.current?.render(p.React.createElement(Garde, { onErreur }, p.React.createElement(composant, proprietes)));
  });

  return <div ref={conteneur} className="k-scope" />;
}

/** En-tête et barre latérale de la plateforme Konitys ; navigation locale si la plateforme ne répond pas. */
export function Coquille({ children }: { children: ReactNode }) {
  const moi = useMoi();
  const router = useRouter();
  const chemin = usePathname();
  const [plateforme, setPlateforme] = useState<Plateforme | null>(null);
  const [local, setLocal] = useState(false);
  const [jetonActuel, setJeton] = useState<string | null>(null);
  const [replie, setReplie] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("k_sidebar_collapsed") === "1";
    } catch {
      return false; // stockage indisponible
    }
  });

  useEffect(() => {
    let fini = false;
    // Plateforme trop lente : on n'attend pas plus de 8 s pour afficher un menu
    const delai = setTimeout(() => !fini && setLocal(true), 8000);
    chargerPlateforme()
      .then((p) => {
        fini = true;
        setPlateforme(p);
        setLocal(false);
      })
      .catch((err) => {
        fini = true;
        console.warn("En-tête de la plateforme indisponible, navigation locale utilisée :", err);
        setLocal(true);
      });
    return () => clearTimeout(delai);
  }, []);

  // Jeton Keycloak pour les notifications de la plateforme, renouvelé régulièrement
  useEffect(() => {
    const maj = () => jeton().then(setJeton).catch(() => setJeton(null));
    maj();
    const t = setInterval(maj, 4 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Droits du menu : les clés accordées, et leur empreinte (dépendance du menu mémorisé)
  const a = useDroits();
  const permis = new Set(SECTIONS.flatMap((s) => s.liens.map((l) => l.perm)).filter((p) => a(p)));
  const cleDroits = [...permis].join("|");
  const voitAlertes = a("pages.alertes.view");
  const voitMentions = a("pages.mentions.view");
  const monLieuSeul = !a("pages.lieux.view") && !!moi.lieuId;

  const { data: compteur } = useQuery({
    queryKey: ["alertes", "compteur"],
    queryFn: () => api<{ nouvelles: number; critiques: number }>("/alertes/compteur"),
    enabled: voitAlertes,
    refetchInterval: 60_000,
  });

  const { data: mentions } = useQuery({
    queryKey: ["mentions"],
    queryFn: () => api<MesMentions>("/commentaires/mentions"),
    enabled: voitMentions,
    refetchInterval: 60_000,
  });

  const nbAlertes = compteur?.nouvelles ?? 0;
  const nbMentions = mentions?.nonLues ?? 0;
  const sections = useMemo(() => {
    if (!plateforme) return [];
    // Sans la liste des lieux mais rattaché à un lieu (partenaire) : un menu réduit à « Mon lieu »
    if (monLieuSeul) return [{ label: "Mon lieu", items: [{ icon: plateforme.icone("MapPin"), label: "Mon lieu", path: `/lieux/${moi.lieuId}` }] }];
    return SECTIONS.map((s) => ({
      label: s.libelle,
      items: s.liens
        .filter((l) => permis.has(l.perm))
        .map((l) => ({
          icon: plateforme.icone(l.icone),
          label: l.libelle,
          path: l.href,
          ...(l.href === "/alertes" && nbAlertes ? { badge: nbAlertes } : {}),
          ...(l.href === "/mentions" && nbMentions ? { badge: nbMentions } : {}),
        })),
    })).filter((s) => s.items.length);
    // permis : recalculé à chaque rendu, comparé par sa clé texte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateforme, cleDroits, monLieuSeul, moi.lieuId, nbAlertes, nbMentions]);

  // La barre latérale ne surligne que le chemin exact : on lui donne l'entrée de menu qui contient la page
  const cheminActif = useMemo(() => {
    const chemins = sections.flatMap((s) => s.items.map((i) => i.path));
    return chemins.filter((c) => (c === "/" ? chemin === "/" : chemin === c || chemin.startsWith(`${c}/`))).sort((a, b) => b.length - a.length)[0] ?? chemin;
  }, [sections, chemin]);

  const naviguer = (cible: string) => (/^https?:\/\//.test(cible) ? window.location.assign(cible) : router.push(cible));
  const replier = (valeur?: boolean) =>
    setReplie((v) => {
      const suivant = typeof valeur === "boolean" ? valeur : !v;
      try {
        localStorage.setItem("k_sidebar_collapsed", suivant ? "1" : "0");
      } catch {
        /* stockage indisponible */
      }
      return suivant;
    });

  if (local) {
    return (
      <div className="min-h-full md:flex">
        <Navigation />
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8 print:p-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-40 print:hidden">
        {plateforme ? (
          <Ilot
            p={plateforme}
            composant={plateforme.HeaderBar}
            onErreur={() => setLocal(true)}
            proprietes={{
              user: { firstName: moi.prenom ?? "", lastName: moi.nom ?? "", email: moi.email, username: moi.email },
              onLogout: () => keycloak()?.logout(),
              currentAppName: "Régie Selfizee",
              onNavigate: naviguer,
              platformUrl: PLATEFORME_URL,
              authToken: jetonActuel ?? undefined,
            }}
          />
        ) : (
          <div className="h-12 border-b border-[#D6DFED] bg-gradient-to-r from-white to-blue-50" />
        )}
      </div>
      {/* Sur téléphone, l'en-tête de la plateforme n'a pas de menu : notre barre de navigation horizontale le remplace */}
      <div className="md:hidden print:hidden">
        <Navigation sousEntete />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="menu-plateforme hidden shrink-0 md:block print:hidden">
          {plateforme ? (
            <Ilot
              p={plateforme}
              composant={plateforme.Sidebar}
              onErreur={() => setLocal(true)}
              proprietes={{ sections, activePath: cheminActif, onNavigate: naviguer, collapsed: replie, onCollapse: replier, platformUrl: PLATEFORME_URL }}
            />
          ) : (
            <div className="sticky top-12 h-[calc(100vh-48px)] w-[210px] bg-[#1E2A40]" />
          )}
        </div>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
