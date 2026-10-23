import type { Metadata } from "next";
import { Figtree, Unbounded } from "next/font/google";

// Page publique des invités : univers « nightlife » de la page souvenir, pas celui de l'admin
const unbounded = Unbounded({ subsets: ["latin"], weight: ["700", "900"], variable: "--f-display" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--f-body" });

export const metadata: Metadata = {
  title: "Mes photos · Selfizee",
  description: "Retrouve tes photos Selfizee avec le code imprimé sur ta photo ou avec ton e-mail.",
};

export default function Layout({ children }: LayoutProps<"/mes-photos">) {
  return <div className={`${unbounded.variable} ${figtree.variable}`}>{children}</div>;
}
