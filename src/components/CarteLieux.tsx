"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as CarteLeaflet } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface PointCarte {
  id: number;
  latitude: number;
  longitude: number;
  couleur: string;
  /** Contenu de l'infobulle (texte) */
  titre: string;
  lignes: string[];
}

// Fond de carte : Plan IGN (Géoplateforme), service public, sans clé
const TUILES_IGN =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

/**
 * Lieux au même endroit (souvent : seule la ville est connue) : décalage en pixels,
 * en cercle, pour qu'ils restent tous visibles et cliquables à tous les zooms.
 */
function decalages(points: PointCarte[]): Map<number, [number, number]> {
  const groupes = new Map<string, PointCarte[]>();
  for (const p of points) {
    const cle = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
  }
  const res = new Map<number, [number, number]>();
  for (const g of groupes.values()) {
    g.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / g.length - Math.PI / 2;
      res.set(p.id, g.length === 1 ? [0, 0] : [Math.round(16 * Math.cos(angle)), Math.round(16 * Math.sin(angle))]);
    });
  }
  return res;
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Carte des lieux (Leaflet, chargé côté navigateur uniquement). Un clic ouvre la fiche du lieu. */
export function CarteLieux({ points, onClic, hauteur = 560 }: { points: PointCarte[]; onClic: (id: number) => void; hauteur?: number }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteLeaflet | null>(null);
  const calque = useRef<LayerGroup | null>(null);
  const premierCadrage = useRef(true);
  const replacer = useRef<(() => void) | null>(null);
  const clic = useRef(onClic);
  useEffect(() => {
    clic.current = onClic;
  }, [onClic]);

  // Création de la carte
  useEffect(() => {
    let annule = false;
    import("leaflet").then((L) => {
      if (annule || !conteneur.current || carte.current) return;
      const m = L.map(conteneur.current, { center: [46.6, 2.4], zoom: 6, scrollWheelZoom: true });
      L.tileLayer(TUILES_IGN, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.ign.fr/">IGN</a> – Géoplateforme',
      }).addTo(m);
      calque.current = L.layerGroup().addTo(m);
      carte.current = m;
    });
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      calque.current = null;
      premierCadrage.current = true;
    };
  }, []);

  // Points (redessinés quand les données ou la couleur changent)
  useEffect(() => {
    let annule = false;
    const dessiner = () =>
      import("leaflet").then((L) => {
        const m = carte.current;
        const c = calque.current;
        if (annule || !m || !c) return;
        c.clearLayers();
        if (replacer.current) m.off("zoomend", replacer.current);
        const ecarts = decalages(points);
        const marqueurs: { marqueur: ReturnType<typeof L.circleMarker>; base: [number, number]; ecart: [number, number] }[] = [];
        for (const p of points) {
          const marqueur = L.circleMarker([p.latitude, p.longitude], {
            radius: 9,
            color: "#ffffff", // liseré blanc : les points restent distincts quand ils se chevauchent
            weight: 2,
            fillColor: p.couleur,
            fillOpacity: 0.95,
          })
            .bindTooltip(`<strong>${echapper(p.titre)}</strong><br>${p.lignes.map(echapper).join("<br>")}`, { direction: "top", offset: [0, -6] })
            .on("click", () => clic.current(p.id))
            .addTo(c);
          marqueurs.push({ marqueur, base: [p.latitude, p.longitude], ecart: ecarts.get(p.id) ?? [0, 0] });
        }
        // Les points superposés sont écartés de quelques pixels, recalculés à chaque zoom
        replacer.current = () => {
          for (const { marqueur, base, ecart } of marqueurs) {
            if (ecart[0] || ecart[1]) marqueur.setLatLng(m.layerPointToLatLng(m.latLngToLayerPoint(base).add(ecart)));
          }
        };
        m.on("zoomend", replacer.current);
        if (premierCadrage.current && points.length) {
          m.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [40, 40], maxZoom: 11 });
          premierCadrage.current = false;
        }
        replacer.current();
      });
    if (carte.current) dessiner();
    else {
      // Carte pas encore prête : on dessine dès qu'elle l'est
      const t = setInterval(() => {
        if (carte.current) {
          clearInterval(t);
          dessiner();
        }
      }, 50);
      return () => {
        annule = true;
        clearInterval(t);
      };
    }
    return () => {
      annule = true;
    };
  }, [points]);

  return (
    <div
      ref={conteneur}
      role="application"
      aria-label="Carte des lieux. Un tableau des mêmes données figure sous la carte."
      className="z-0 w-full overflow-hidden rounded-lg border border-line"
      style={{ height: hauteur }}
    />
  );
}
