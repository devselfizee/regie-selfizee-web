import type { Metadata } from "next";
import "./globals.css";
import { Espaces } from "@/components/Espaces";

export const metadata: Metadata = {
  title: "Régie Selfizee",
  description: "Suivi du chiffre d'affaires et des commissions des bornes en régie",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" data-theme="light" className="h-full antialiased">
      <body className="min-h-full">
        <Espaces>{children}</Espaces>
      </body>
    </html>
  );
}
