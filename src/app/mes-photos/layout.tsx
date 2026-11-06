import type { CSSProperties } from "react";
import type { Metadata } from "next";

// Page publique des invités : univers « nightlife » de la page souvenir, pas celui de l'admin.
// Polices chargées par le navigateur (Google Fonts) et non plus par next/font/google au build : un build
// dépendait du réseau vers Google et a échoué sur Coolify le 06/11/2026.
const POLICES = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&family=Unbounded:wght@700;900&display=swap";

export const metadata: Metadata = {
  title: "Mes photos · Selfizee",
  description: "Retrouve tes photos Selfizee avec le code imprimé sur ta photo ou avec ton e-mail.",
};

export default function Layout({ children }: LayoutProps<"/mes-photos">) {
  return (
    <div style={{ "--f-display": "'Unbounded'", "--f-body": "'Figtree'" } as CSSProperties}>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* React 19 place la feuille de style dans le <head> */}
      <link rel="stylesheet" href={POLICES} precedence="default" />
      {children}
    </div>
  );
}
