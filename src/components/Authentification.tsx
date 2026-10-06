"use client";

import { useEffect, useState, type ReactNode } from "react";
import { authActive, initialiserAuth } from "@/lib/auth";

/** N'affiche l'application qu'une fois l'utilisateur connecté via Keycloak. */
export function Authentification({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<"attente" | "ok" | "erreur">(authActive ? "attente" : "ok");

  useEffect(() => {
    if (!authActive) return;
    initialiserAuth()
      .then(() => setEtat("ok"))
      .catch((err) => {
        console.error("Keycloak :", err);
        setEtat("erreur");
      });
  }, []);

  if (etat === "attente") {
    return <p className="w-full py-20 text-center text-sm text-ink-muted">Connexion…</p>;
  }
  if (etat === "erreur") {
    return (
      <div className="w-full py-20 text-center text-sm text-ink-2">
        Erreur d&apos;authentification.{" "}
        <button type="button" className="text-accent underline" onClick={() => window.location.reload()}>Réessayer</button>
      </div>
    );
  }
  return <>{children}</>;
}
