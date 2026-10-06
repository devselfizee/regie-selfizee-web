import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "@/components/Navigation";
import { Authentification } from "@/components/Authentification";

export const metadata: Metadata = {
  title: "Régie Selfizee",
  description: "Suivi du chiffre d'affaires et des commissions des bornes en régie",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full md:flex">
        <Authentification>
          <Navigation />
          <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
            <Providers>{children}</Providers>
          </main>
        </Authentification>
      </body>
    </html>
  );
}
