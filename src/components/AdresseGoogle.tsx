"use client";

import { useEffect, useRef } from "react";

// Autocomplétion d'adresse Google Places (comme l'application stock) : choisir une proposition
// remplit l'adresse, le code postal, la ville et la position. Sans clé, champ texte simple
// (la position est alors calculée par l'API à l'enregistrement).
const CLE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export interface AdresseChoisie {
  adresse: string;
  codePostal: string;
  ville: string;
  latitude: number;
  longitude: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- API Google Maps chargée à l'exécution, sans types */
let chargement: Promise<void> | null = null;
function chargerGoogle(): Promise<void> {
  if ((window as any).google?.maps?.places) return Promise.resolve();
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CLE)}&libraries=places&language=fr`;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      chargement = null;
      ko(new Error("Google Maps indisponible"));
    };
    document.head.appendChild(s);
  });
  return chargement;
}

export const autocompletionGoogle = CLE !== "";

export function AdresseGoogle({
  valeur,
  onSaisie,
  onChoix,
}: {
  valeur: string;
  onSaisie: (texte: string) => void;
  onChoix: (a: AdresseChoisie) => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const rappel = useRef(onChoix);
  useEffect(() => {
    rappel.current = onChoix;
  });

  useEffect(() => {
    if (!CLE || !champ.current) return;
    let auto: any;
    chargerGoogle()
      .then(() => {
        const g = (window as any).google;
        auto = new g.maps.places.Autocomplete(champ.current, {
          componentRestrictions: { country: ["fr", "be", "ch", "lu", "mc"] },
          fields: ["address_components", "geometry", "name"],
        });
        auto.addListener("place_changed", () => {
          const lieu = auto.getPlace();
          if (!lieu?.geometry?.location || !lieu.address_components) return;
          const composant = (type: string) => lieu.address_components.find((c: any) => c.types.includes(type))?.long_name ?? "";
          const rue = [composant("street_number"), composant("route")].filter(Boolean).join(" ");
          rappel.current({
            adresse: rue || lieu.name || "",
            codePostal: composant("postal_code"),
            ville: composant("locality") || composant("postal_town") || composant("administrative_area_level_2"),
            latitude: Math.round(lieu.geometry.location.lat() * 1e6) / 1e6,
            longitude: Math.round(lieu.geometry.location.lng() * 1e6) / 1e6,
          });
        });
      })
      .catch((err) => console.warn("Autocomplétion d'adresse indisponible :", err));
    return () => {
      if (auto) (window as any).google?.maps?.event?.clearInstanceListeners(auto);
    };
  }, []);

  return (
    <input
      ref={champ}
      className="champ"
      value={valeur}
      onChange={(e) => onSaisie(e.target.value)}
      // Entrée dans la liste Google : choisir, pas envoyer le formulaire
      onKeyDown={(e) => e.key === "Enter" && CLE && e.preventDefault()}
      placeholder={CLE ? "Tapez le nom du lieu ou son adresse…" : undefined}
      autoComplete="off"
    />
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
