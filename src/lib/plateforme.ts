// En-tête et barre latérale communs aux applications Konitys, chargés en ligne depuis la
// plateforme (Module Federation, comme l'application stock).
// Les composants distants sont compilés pour React 18 (leur moteur JSX crée des éléments
// React 18, que React 19 refuse) : ils sont donc rendus dans un îlot React 18 séparé,
// chargé depuis un CDN, et partagé avec eux via le « shared scope » de la fédération.

export const PLATEFORME_URL = (process.env.NEXT_PUBLIC_PLATEFORM_URL ?? "https://plateform.orkessi.com").replace(/\/+$/, "");
const REACT18 = "https://esm.sh/react@18.3.1";
const REACT_DOM18 = "https://esm.sh/react-dom@18.3.1";
const LUCIDE = "https://esm.sh/lucide@0.460.0";

// import() d'une URL absolue, à l'abri du bundler (qui tenterait de l'empaqueter)
const importer = new Function("u", "return import(u)") as (url: string) => Promise<Record<string, unknown>>;

/* eslint-disable @typescript-eslint/no-explicit-any -- modules chargés à l'exécution, sans types */
export interface React18 {
  createElement: (...args: any[]) => any;
  Component: any;
}
export interface Racine18 {
  render: (element: unknown) => void;
  unmount: () => void;
}
export interface Plateforme {
  React: React18;
  creerRacine: (conteneur: Element) => Racine18;
  HeaderBar: unknown;
  Sidebar: unknown;
  icone: (nom: string) => unknown;
}

type NoeudIcone = [string, Record<string, string>][];

let chargement: Promise<Plateforme> | null = null;

/** Charge une seule fois React 18, les composants distants et les icônes. */
export function chargerPlateforme(): Promise<Plateforme> {
  chargement ??= (async () => {
    const [React, ReactDOM, ReactDOMClient, lucide] = await Promise.all([
      importer(REACT18),
      importer(REACT_DOM18),
      importer(`${REACT_DOM18}/client`),
      importer(LUCIDE).catch(() => ({}) as Record<string, unknown>),
    ]);

    // Les composants distants récupèrent React par importShared('react') : on leur prête React 18
    const g = globalThis as any;
    g.__federation_shared__ ??= {};
    g.__federation_shared__.default ??= {};
    const partage = g.__federation_shared__.default;
    partage.react ??= { "18.3.1": { get: () => () => React, scope: "default" } };
    partage["react-dom"] ??= { "18.3.1": { get: () => () => ReactDOM, scope: "default" } };

    const conteneur = (await importer(`${PLATEFORME_URL}/assets/remoteEntry.js`)) as any;
    conteneur.init({});
    const charger = async (nom: string) => {
      const r = (await conteneur.get(nom))();
      return r && typeof r === "object" && "default" in r ? r.default : r;
    };
    const [HeaderBar, Sidebar] = await Promise.all([charger("./HeaderBar"), charger("./Sidebar")]);

    // Icônes Lucide sous forme de composants React 18 (la barre latérale les rend avec son React)
    const R = React as unknown as React18;
    const cache = new Map<string, unknown>();
    const icone = (nom: string) => {
      if (!cache.has(nom)) {
        const brut = (lucide as Record<string, unknown>)[nom] as NoeudIcone | ["svg", object, NoeudIcone] | undefined;
        const noeuds: NoeudIcone = !brut ? [] : brut[0] === "svg" ? (brut as ["svg", object, NoeudIcone])[2] : (brut as NoeudIcone);
        cache.set(nom, (p: { className?: string }) =>
          R.createElement(
            "svg",
            { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className: p.className, "aria-hidden": true },
            ...noeuds.map(([balise, attributs], i) => R.createElement(balise, { ...attributs, key: i }))
          )
        );
      }
      return cache.get(nom);
    };

    return {
      React: R,
      creerRacine: (el: Element) => (ReactDOMClient as any).createRoot(el) as Racine18,
      HeaderBar,
      Sidebar,
      icone,
    };
  })().catch((err) => {
    chargement = null; // nouvel essai au prochain chargement de page
    throw err;
  });
  return chargement;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
