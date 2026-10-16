import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Coquille } from "@/components/Coquille";
import { Authentification } from "@/components/Authentification";
import { Session } from "@/lib/session";

export const metadata: Metadata = {
  title: "Régie Selfizee",
  description: "Suivi du chiffre d'affaires et des commissions des bornes en régie",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        <Authentification>
          <Providers>
            <Session>
              <Coquille>{children}</Coquille>
            </Session>
          </Providers>
        </Authentification>
      </body>
    </html>
  );
}
