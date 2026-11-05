"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LieuListe } from "@/lib/api";

/** « Apsara Club (Saint-Brieuc, 22) » */
export const nomLieu = (l: Pick<LieuListe, "enseigne" | "ville" | "departement">) => {
  const lieu = [l.ville, l.departement].filter(Boolean).join(", ");
  return lieu ? `${l.enseigne} (${lieu})` : l.enseigne;
};

// Recherche sans tenir compte des accents ni des majuscules
const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Valeurs montrées à la fois : la recherche sert à trouver les autres
const MAX_AFFICHES = 15;

/**
 * Choix d'un lieu façon select2 : un bouton, puis une recherche au fil de la frappe dans la liste
 * (des centaines de lieux). Vide : tous les lieux.
 */
export function ChoixLieu({
  id,
  lieux,
  valeur,
  onChange,
  tous = "Tous les lieux",
}: {
  id: string;
  lieux: LieuListe[];
  valeur: string;
  onChange: (lieuId: string) => void;
  tous?: string;
}) {
  const options = useMemo(() => lieux.map((l) => ({ id: String(l.id), libelle: nomLieu(l) })), [lieux]);
  return (
    <ChoixRecherche
      id={id}
      options={options}
      valeur={valeur}
      onChange={onChange}
      vide={tous}
      placeholder="Rechercher un lieu, une ville, un département…"
      aucun="Aucun lieu ne correspond."
      autres={(n) => `${n} autre${n > 1 ? "s" : ""} lieu${n > 1 ? "x" : ""} : tapez quelques lettres pour les trouver.`}
    />
  );
}

/**
 * Liste déroulante avec recherche (villes principales, commerciaux…) : un bouton, puis une recherche au fil de
 * la frappe, sans accents ni majuscules. Valeur vide : le libellé `vide`.
 */
export function ChoixRecherche({
  id,
  options: valeurs,
  valeur,
  onChange,
  vide = "—",
  placeholder = "Rechercher…",
  aucun = "Aucune valeur ne correspond.",
  autres: libelleAutres = (n: number) => `${n} autre${n > 1 ? "s" : ""} : tapez quelques lettres pour les trouver.`,
}: {
  id?: string;
  options: { id: string; libelle: string }[];
  valeur: string;
  onChange: (valeur: string) => void;
  vide?: string;
  placeholder?: string;
  aucun?: string;
  autres?: (n: number) => string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [actif, setActif] = useState(0);
  // Liste en position fixe, calée sur le bouton : rien ne la rogne (modale qui défile, colonne étroite)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const idListe = useId();

  const choisi = valeurs.find((o) => o.id === valeur);
  const { options, autres } = useMemo(() => {
    const q = sansAccents(recherche.trim());
    const trouves = valeurs.filter((o) => !q || sansAccents(o.libelle).includes(q)).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    return { options: [{ id: "", libelle: vide }, ...trouves.slice(0, MAX_AFFICHES)], autres: Math.max(0, trouves.length - MAX_AFFICHES) };
  }, [valeurs, recherche, vide]);

  // Fermeture au clic en dehors
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  // Position de la liste : sous le bouton (au-dessus s'il manque la place), au moins 18rem de large, dans l'écran
  useEffect(() => {
    if (!ouvert) return;
    const placer = () => {
      const r = conteneur.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 288), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const enHaut = window.innerHeight - r.bottom < 360 && r.top > window.innerHeight - r.bottom;
      setPos(enHaut ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
    };
    placer();
    window.addEventListener("resize", placer);
    window.addEventListener("scroll", placer, true);
    return () => {
      window.removeEventListener("resize", placer);
      window.removeEventListener("scroll", placer, true);
    };
  }, [ouvert]);

  // L'option active reste visible quand on descend au clavier
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  const ouvrir = () => {
    setRecherche("");
    setPos(null);
    setActif(Math.max(0, options.findIndex((o) => o.id === valeur)));
    setOuvert(true);
    setTimeout(() => champ.current?.focus(), 0);
  };
  const choisir = (lieuId: string) => {
    onChange(lieuId);
    setOuvert(false);
  };

  return (
    <div ref={conteneur} className="relative">
      <button
        id={id}
        type="button"
        className="champ flex items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
      >
        <span className={`truncate ${choisi ? "" : "text-ink-2"}`}>{choisi ? choisi.libelle : vide}</span>
        <span className="flex shrink-0 items-center gap-1 text-ink-muted">
          {choisi && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={vide}
              className="rounded px-1 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                choisir("");
              }}
            >
              ✕
            </span>
          )}
          <span aria-hidden>▾</span>
        </span>
      </button>

      {ouvert && pos && (
        <div className="fixed z-50 rounded-md border border-line bg-surface shadow-lg" style={pos}>
          <div className="border-b border-line p-2">
            <input
              ref={champ}
              className="champ"
              placeholder={placeholder}
              role="combobox"
              aria-expanded
              aria-controls={idListe}
              aria-activedescendant={`${idListe}-${actif}`}
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setActif(e.target.value.trim() ? 1 : 0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActif((a) => Math.min(a + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActif((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[actif]) choisir(options[actif].id);
                } else if (e.key === "Escape") {
                  setOuvert(false);
                }
              }}
            />
          </div>
          <ul ref={liste} id={idListe} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.map((o, i) => (
              <li
                key={o.id || "tous"}
                id={`${idListe}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.id === valeur}
                className={`cursor-pointer px-3 py-1.5 text-sm ${i === actif ? "bg-accent text-accent-ink" : `${o.id === valeur ? "font-medium" : ""} ${o.id ? "" : "text-ink-2"}`}`}
                onMouseEnter={() => setActif(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(o.id);
                }}
              >
                {o.libelle}
              </li>
            ))}
            {options.length === 1 && <li className="px-3 py-1.5 text-sm text-ink-muted">{aucun}</li>}
            {autres > 0 && (
              <li className="border-t border-line px-3 py-1.5 text-xs text-ink-muted">
                {libelleAutres(autres)}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
