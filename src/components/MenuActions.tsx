"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ActionMenu {
  libelle: string;
  aide?: string;
  /** Lien (une page) ou action (une fenêtre) */
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

/**
 * Bouton qui ouvre un menu d'actions (« ⋯ » d'une ligne, « Suivi technique »…). Échap et clic ailleurs le ferment.
 * Le menu est en position fixe : il n'est pas rogné par un tableau qui défile.
 */
export function MenuActions({ libelle, actions, declencheur, className }: { libelle: string; actions: ActionMenu[]; declencheur?: ReactNode; className?: string }) {
  const [position, setPosition] = useState<{ haut: number; droite: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const ouvert = position !== null;

  useEffect(() => {
    if (!ouvert) return;
    const fermer = () => setPosition(null);
    const dehors = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && !bouton.current?.contains(e.target as Node) && fermer();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    // Le premier choix prend le focus, pour le clavier
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [ouvert]);

  const basculer = () => {
    if (ouvert) return setPosition(null);
    const r = bouton.current!.getBoundingClientRect();
    setPosition({ haut: r.bottom + 4, droite: window.innerWidth - r.right });
  };
  const classeChoix = (danger?: boolean) =>
    `block w-full px-4 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none ${danger ? "text-crit-ink" : "text-ink"}`;

  return (
    <>
      <button
        ref={bouton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={declencheur ? undefined : libelle}
        title={declencheur ? undefined : libelle}
        onClick={basculer}
        className={className ?? `flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none ${ouvert ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
      >
        {declencheur ?? <span aria-hidden>⋯</span>}
      </button>
      {position && (
        <div
          ref={menu}
          role="menu"
          aria-label={libelle}
          style={{ top: position.haut, right: position.droite }}
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 text-left shadow-xl"
        >
          {actions.map((a) => {
            const contenu = (
              <>
                {a.libelle}
                {a.aide && <span className="block text-xs text-ink-muted">{a.aide}</span>}
              </>
            );
            return a.href ? (
              <Link key={a.libelle} href={a.href} role="menuitem" className={classeChoix(a.danger)} onClick={() => setPosition(null)}>
                {contenu}
              </Link>
            ) : (
              <button
                key={a.libelle}
                type="button"
                role="menuitem"
                className={classeChoix(a.danger)}
                onClick={() => {
                  setPosition(null);
                  a.onClick?.();
                }}
              >
                {contenu}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
