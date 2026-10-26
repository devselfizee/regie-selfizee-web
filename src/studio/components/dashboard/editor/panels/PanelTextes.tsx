"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { FONT_LIST, FONT_CATEGORIES, loadGoogleFont, searchFonts, type FontCategory, type CustomFont, loadCustomFontFace, setCustomFonts as setSharedCustomFonts, subscribeCustomFonts, fetchCustomFontsFromApi } from "./fonts";
import { toast } from "../../Toast";
import { apiUrl } from "@/studio/lib/api";

/* ═══════════════════════════════════════════════════════════════
   Text style presets — add text with effects pre-applied
   ═══════════════════════════════════════════════════════════════ */
interface TextStylePreset {
  id: string;
  name: string;
  label: string;
  text: string;
  font: string;
  size: number;
  weight: string;
  props: Record<string, any>;
  // Card visual
  cardBg: string;
  cardColor: string;
  cardShadow?: string;
  cardStroke?: string;
  cardSubColor?: string;
}

const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: "neon-purple", name: "Néon violet", label: "Néon", text: "SMILE", font: "Montserrat",
    size: 48, weight: "bold",
    props: { fill: "#c084fc", stroke: "#4f46e5", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 0px 15px #4f46e5" },
    cardBg: "#1a1a2e", cardColor: "#c084fc", cardShadow: "0 0 12px #4f46e5, 0 0 24px #4f46e560", cardSubColor: "#4f46e5",
  },
  {
    id: "neon-pink", name: "Néon rose", label: "Glow", text: "LOVE", font: "Bebas Neue",
    size: 52, weight: "bold",
    props: { fill: "#fb7185", stroke: "#e11d48", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 0px 20px #e11d48" },
    cardBg: "#1c1017", cardColor: "#fb7185", cardShadow: "0 0 12px #e11d48, 0 0 24px #e11d4860", cardSubColor: "#e11d48",
  },
  {
    id: "retro-3d", name: "Rétro 3D", label: "Retro", text: "VINTAGE", font: "Abril Fatface",
    size: 48, weight: "bold",
    props: { fill: "#fbbf24", stroke: "#92400e", strokeWidth: 3, paintFirst: "stroke", shadow: "4px 4px 0px #92400e" },
    cardBg: "#fef3c7", cardColor: "#92400e", cardShadow: "3px 3px 0px #92400e", cardSubColor: "#b45309",
  },
  {
    id: "outline-white", name: "Contour blanc", label: "Outline", text: "CHEESE", font: "Poppins",
    size: 44, weight: "bold",
    props: { fill: "transparent", stroke: "#ffffff", strokeWidth: 3, paintFirst: "stroke" },
    cardBg: "linear-gradient(135deg, #667eea, #764ba2)", cardColor: "transparent", cardStroke: "2px #fff", cardSubColor: "#ffffffaa",
  },
  {
    id: "shadow-hard", name: "Ombre dure", label: "Shadow", text: "PARTY", font: "Anton",
    size: 48, weight: "bold",
    props: { fill: "#1a1a2e", shadow: "5px 5px 0px #4f46e5" },
    cardBg: "#ebf0fa", cardColor: "#1a1a2e", cardShadow: "4px 4px 0px #4f46e5", cardSubColor: "#4f46e5",
  },
  {
    id: "elegant-gold", name: "Or élégant", label: "Gold", text: "MERCI", font: "Playfair Display",
    size: 44, weight: "bold",
    props: { fill: "#d4a574", stroke: "#92400e", strokeWidth: 1, paintFirst: "stroke", shadow: "2px 2px 8px rgba(146,64,14,0.3)" },
    cardBg: "linear-gradient(135deg, #1a1a2e, #292524)", cardColor: "#d4a574", cardShadow: "1px 1px 6px #d4a57480", cardSubColor: "#d4a574",
  },
  {
    id: "pop-comic", name: "Pop / Comic", label: "POP!", text: "POP!", font: "Bangers",
    size: 52, weight: "bold",
    props: { fill: "#fbbf24", stroke: "#1a1a2e", strokeWidth: 4, paintFirst: "stroke", shadow: "3px 3px 0px #ef4444" },
    cardBg: "#fef2f2", cardColor: "#fbbf24", cardStroke: "2.5px #1a1a2e", cardShadow: "2px 2px 0px #ef4444", cardSubColor: "#ef4444",
  },
  {
    id: "frost", name: "Givré", label: "Frost", text: "HIVER", font: "Quicksand",
    size: 44, weight: "bold",
    props: { fill: "#bfdbfe", stroke: "#1e40af", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 0px 12px #3b82f6" },
    cardBg: "linear-gradient(135deg, #dbeafe, #e0f2fe, #f0f9ff)", cardColor: "#1e40af", cardShadow: "0 0 10px #3b82f680", cardSubColor: "#3b82f6",
  },
  {
    id: "fire", name: "Feu", label: "Fire", text: "ON FIRE", font: "Permanent Marker",
    size: 48, weight: "bold",
    props: { fill: "#ef4444", stroke: "#7f1d1d", strokeWidth: 2, paintFirst: "stroke", shadow: "0px 0px 15px #f97316" },
    cardBg: "linear-gradient(135deg, #dc2626, #f97316, #fbbf24)", cardColor: "#fff", cardShadow: "0 0 10px #f9731680, 0 0 20px #ef444440", cardSubColor: "#fef3c7",
  },
  {
    id: "minimal-shadow", name: "Minimal", label: "Clean", text: "SOUVENIR", font: "Inter",
    size: 36, weight: "600",
    props: { fill: "#374151", shadow: "0px 2px 8px rgba(0,0,0,0.15)" },
    cardBg: "#ffffff", cardColor: "#374151", cardShadow: "0 2px 6px rgba(0,0,0,0.12)", cardSubColor: "#9ca3af",
  },
  {
    id: "long-shadow", name: "Ombre longue", label: "Long", text: "SELFIE", font: "Oswald",
    size: 48, weight: "bold",
    props: { fill: "#ffffff", shadow: "1px 1px 0 #4f46e5" },
    cardBg: "#4f46e5", cardColor: "#ffffff", cardShadow: "1px 1px 0 #4338ca, 2px 2px 0 #4338ca, 3px 3px 0 #4338ca, 4px 4px 0 #4338ca", cardSubColor: "#c7d2fe",
  },
  {
    id: "glitch", name: "Glitch", label: "Glitch", text: "PIXEL", font: "Space Grotesk",
    size: 44, weight: "bold",
    props: { fill: "#ffffff", shadow: "3px 0px 0px #00ffff" },
    cardBg: "linear-gradient(135deg, #18181b, #27272a)", cardColor: "#ffffff", cardShadow: "2px 0 0 #ff00ff, -2px 0 0 #00ffff", cardSubColor: "#00ffff",
  },
  {
    id: "emboss", name: "Relief", label: "Relief", text: "CLASSE", font: "Raleway",
    size: 44, weight: "bold",
    props: { fill: "#d1d5db", shadow: "-1px -1px 0px #ffffff" },
    cardBg: "linear-gradient(135deg, #f8fafc, #e2e8f0)", cardColor: "#94a3b8", cardShadow: "-1px -1px 0 #fff, 1px 1px 2px #64748b", cardSubColor: "#64748b",
  },
  {
    id: "gradient-sunset", name: "Coucher soleil", label: "Sunset", text: "SUMMER", font: "Montserrat",
    size: 44, weight: "bold",
    props: { fill: "#f97316", stroke: "#dc2626", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 2px 10px rgba(249,115,22,0.4)" },
    cardBg: "linear-gradient(135deg, #fbbf24, #f97316, #ec4899)", cardColor: "#fff", cardShadow: "0 2px 8px #f9731660", cardSubColor: "#fffbeb",
  },
  {
    id: "double-stroke", name: "Double contour", label: "Double", text: "FÊTE", font: "Lilita One",
    size: 44, weight: "bold",
    props: { fill: "#fbbf24", stroke: "#1a1a2e", strokeWidth: 5, paintFirst: "stroke" },
    cardBg: "#3b82f6", cardColor: "#fbbf24", cardStroke: "3px #1a1a2e", cardSubColor: "#93c5fd",
  },
  {
    id: "chalk", name: "Craie", label: "Chalk", text: "CRAIE", font: "Amatic SC",
    size: 52, weight: "bold",
    props: { fill: "#ffffff", shadow: "0px 0px 3px rgba(255,255,255,0.5)" },
    cardBg: "linear-gradient(135deg, #166534, #14532d)", cardColor: "#ffffff", cardShadow: "0 0 2px #ffffff60", cardSubColor: "#86efac",
  },
  // ── Photobooth / Événementiel ──
  {
    id: "wedding", name: "Mariage", label: "Wedding", text: "I DO", font: "Great Vibes",
    size: 44, weight: "bold",
    props: { fill: "#d4a574", shadow: "0px 2px 6px rgba(212,165,116,0.3)" },
    cardBg: "linear-gradient(135deg, #fefce8, #fef3c7)", cardColor: "#92400e", cardShadow: "0 2px 4px #d4a57440", cardSubColor: "#b45309",
  },
  {
    id: "party-balloon", name: "Fête", label: "Party", text: "PARTY!", font: "Fredoka",
    size: 48, weight: "bold",
    props: { fill: "#ec4899", stroke: "#be185d", strokeWidth: 2, paintFirst: "stroke", shadow: "2px 2px 0px #fbbf24" },
    cardBg: "linear-gradient(135deg, #fdf2f8, #e0e7ff)", cardColor: "#ec4899", cardShadow: "2px 2px 0 #fbbf24", cardSubColor: "#be185d",
  },
  {
    id: "neon-green", name: "Néon vert", label: "Matrix", text: "FLASH", font: "Space Grotesk",
    size: 44, weight: "bold",
    props: { fill: "#4ade80", stroke: "#166534", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 0px 15px #22c55e" },
    cardBg: "#052e16", cardColor: "#4ade80", cardShadow: "0 0 12px #22c55e, 0 0 24px #22c55e40", cardSubColor: "#22c55e",
  },
  {
    id: "stamp", name: "Tampon", label: "Stamp", text: "VIP", font: "Oswald",
    size: 40, weight: "bold",
    props: { fill: "transparent", stroke: "#dc2626", strokeWidth: 4, paintFirst: "stroke" },
    cardBg: "#fef2f2", cardColor: "transparent", cardStroke: "2.5px #dc2626", cardSubColor: "#dc2626",
  },
  {
    id: "disco", name: "Disco", label: "Disco", text: "DISCO", font: "Righteous",
    size: 48, weight: "bold",
    props: { fill: "#f0abfc", stroke: "#4338ca", strokeWidth: 2, paintFirst: "stroke", shadow: "0px 0px 20px #d946ef" },
    cardBg: "linear-gradient(135deg, #2e1065, #581c87)", cardColor: "#f0abfc", cardShadow: "0 0 15px #d946ef80", cardSubColor: "#d946ef",
  },
  {
    id: "graffiti", name: "Graffiti", label: "Street", text: "STREET", font: "Permanent Marker",
    size: 48, weight: "bold",
    props: { fill: "#fbbf24", stroke: "#000000", strokeWidth: 5, paintFirst: "stroke", shadow: "3px 3px 0px #ef4444" },
    cardBg: "linear-gradient(135deg, #f97316, #ef4444, #eab308)", cardColor: "#fbbf24", cardStroke: "3px #000", cardShadow: "2px 2px 0 #ef4444", cardSubColor: "#fff",
  },
  {
    id: "pastel-soft", name: "Pastel", label: "Soft", text: "Bisous", font: "Quicksand",
    size: 44, weight: "bold",
    props: { fill: "#c084fc", shadow: "0px 2px 8px rgba(192,132,252,0.3)" },
    cardBg: "linear-gradient(135deg, #faf5ff, #fce7f3)", cardColor: "#c084fc", cardShadow: "0 2px 6px #c084fc30", cardSubColor: "#4f46e5",
  },
  {
    id: "horror", name: "Horreur", label: "Horror", text: "BOO!", font: "Creepster",
    size: 48, weight: "bold",
    props: { fill: "#dc2626", stroke: "#450a0a", strokeWidth: 2, paintFirst: "stroke", shadow: "0px 0px 15px #dc2626" },
    cardBg: "linear-gradient(135deg, #1c1917, #292524)", cardColor: "#dc2626", cardShadow: "0 0 10px #dc262680", cardSubColor: "#ef4444",
  },
  {
    id: "tropical", name: "Tropical", label: "Aloha", text: "ALOHA", font: "Pacifico",
    size: 44, weight: "bold",
    props: { fill: "#14b8a6", stroke: "#064e3b", strokeWidth: 1, paintFirst: "stroke", shadow: "2px 2px 6px rgba(20,184,166,0.3)" },
    cardBg: "linear-gradient(135deg, #ecfdf5, #cffafe)", cardColor: "#14b8a6", cardShadow: "1px 1px 4px #14b8a640", cardSubColor: "#0d9488",
  },
  {
    id: "luxury-black", name: "Luxe noir", label: "Luxe", text: "LUXE", font: "DM Serif Display",
    size: 44, weight: "bold",
    props: { fill: "#d4a574", stroke: "#78350f", strokeWidth: 1, paintFirst: "stroke", shadow: "0px 0px 10px rgba(212,165,116,0.4)" },
    cardBg: "linear-gradient(135deg, #0f0f0f, #1a1a2e)", cardColor: "#d4a574", cardShadow: "0 0 8px #d4a57450", cardSubColor: "#d4a574",
  },
];

/* ═══════════════════════════════════════════════════════════════
   Recently used fonts — persisted in localStorage
   ═══════════════════════════════════════════════════════════════ */
const RECENT_KEY = "selfizee_recent_fonts";
const MAX_RECENT = 6;

function getRecentFonts(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, MAX_RECENT); } catch { return []; }
}
function addRecentFont(font: string) {
  const prev = getRecentFonts().filter(f => f !== font);
  const next = [font, ...prev].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

/* ═══════════════════════════════════════════════════════════════
   Text combo presets — multi-layer text compositions (à la Canva)
   ═══════════════════════════════════════════════════════════════ */
interface TextComboPreset {
  id: string;
  name: string;
  layers: { text: string; fontSize: number; fontWeight: string; fontFamily: string; fill: string; offsetY: number; props?: Record<string, any> }[];
  // Card preview
  cardBg: string;
}

const TEXT_COMBO_PRESETS: TextComboPreset[] = [
  {
    id: "mariage-elegant", name: "Mariage élégant",
    cardBg: "linear-gradient(135deg, #fefce8, #fef3c7)",
    layers: [
      { text: "Le mariage de", fontSize: 14, fontWeight: "normal", fontFamily: "Dancing Script", fill: "#92400e", offsetY: -32, props: {} },
      { text: "Julie & Antoine", fontSize: 38, fontWeight: "bold", fontFamily: "Great Vibes", fill: "#92400e", offsetY: 2, props: { shadow: "0px 2px 6px rgba(146,64,14,0.2)" } },
      { text: "12 JUILLET 2025", fontSize: 10, fontWeight: "600", fontFamily: "Montserrat", fill: "#b45309", offsetY: 32, props: { charSpacing: 400 } },
    ],
  },
  {
    id: "anniversaire-fun", name: "Anniversaire fun",
    cardBg: "linear-gradient(135deg, #fdf2f8, #fce7f3)",
    layers: [
      { text: "Joyeux", fontSize: 24, fontWeight: "bold", fontFamily: "Caveat", fill: "#ec4899", offsetY: -24, props: {} },
      { text: "ANNIVERSAIRE!", fontSize: 36, fontWeight: "bold", fontFamily: "Lilita One", fill: "#ec4899", offsetY: 14, props: { stroke: "#be185d", strokeWidth: 3, paintFirst: "stroke" } },
    ],
  },
  {
    id: "soiree-neon", name: "Soirée néon",
    cardBg: "linear-gradient(135deg, #0f0f1a, #1a1a2e)",
    layers: [
      { text: "soirée", fontSize: 22, fontWeight: "normal", fontFamily: "Dancing Script", fill: "#c084fc", offsetY: -22, props: {} },
      { text: "DISCO", fontSize: 48, fontWeight: "bold", fontFamily: "Fredoka", fill: "#c084fc", offsetY: 18, props: { stroke: "#4f46e5", strokeWidth: 3, paintFirst: "stroke", shadow: "0px 0px 15px #4f46e5" } },
    ],
  },
  {
    id: "photobooth-party", name: "Photo Party",
    cardBg: "#ffffff",
    layers: [
      { text: "SMILE!", fontSize: 52, fontWeight: "bold", fontFamily: "Anton", fill: "#f97316", offsetY: -14, props: { shadow: "3px 3px 0px #ea580c" } },
      { text: "on est là pour s'amuser", fontSize: 16, fontWeight: "normal", fontFamily: "Dancing Script", fill: "#9ca3af", offsetY: 26, props: {} },
    ],
  },
  {
    id: "gala-vip", name: "Gala VIP",
    cardBg: "linear-gradient(135deg, #0f0f0f, #1a1a2e)",
    layers: [
      { text: "SOIRÉE DE GALA", fontSize: 12, fontWeight: "600", fontFamily: "Montserrat", fill: "#d4a574", offsetY: -32, props: { charSpacing: 400 } },
      { text: "Entreprise & Co", fontSize: 34, fontWeight: "bold", fontFamily: "Playfair Display", fill: "#d4a574", offsetY: 0, props: { shadow: "0px 0px 10px rgba(212,165,116,0.3)" } },
      { text: "20 DÉCEMBRE 2025", fontSize: 10, fontWeight: "600", fontFamily: "Montserrat", fill: "#92400e", offsetY: 28, props: { charSpacing: 300 } },
    ],
  },
  {
    id: "retro-booth", name: "Rétro booth",
    cardBg: "#f3f4f6",
    layers: [
      { text: "PHOTO", fontSize: 36, fontWeight: "bold", fontFamily: "Press Start 2P", fill: "#6366f1", offsetY: -18, props: { shadow: "3px 0px 0px #ec4899" } },
      { text: "BOOTH", fontSize: 36, fontWeight: "bold", fontFamily: "Press Start 2P", fill: "#6366f1", offsetY: 20, props: { shadow: "3px 0px 0px #ec4899" } },
    ],
  },
  {
    id: "baby-shower", name: "Baby shower",
    cardBg: "linear-gradient(135deg, #eff6ff, #dbeafe)",
    layers: [
      { text: "Bienvenue", fontSize: 28, fontWeight: "bold", fontFamily: "Quicksand", fill: "#60a5fa", offsetY: -22, props: {} },
      { text: "bébé Lucas", fontSize: 36, fontWeight: "bold", fontFamily: "Fredoka", fill: "#3b82f6", offsetY: 14, props: { stroke: "#1d4ed8", strokeWidth: 2, paintFirst: "stroke" } },
    ],
  },
  {
    id: "evjf-team", name: "EVJF",
    cardBg: "linear-gradient(135deg, #fdf2f8, #fce7f3)",
    layers: [
      { text: "TEAM", fontSize: 18, fontWeight: "bold", fontFamily: "Montserrat", fill: "#be185d", offsetY: -28, props: { charSpacing: 600 } },
      { text: "Bride", fontSize: 44, fontWeight: "bold", fontFamily: "Great Vibes", fill: "#ec4899", offsetY: 6, props: { shadow: "0px 2px 8px rgba(236,72,153,0.3)" } },
      { text: "#ENTERREMENTDEVIEJF", fontSize: 7, fontWeight: "600", fontFamily: "Montserrat", fill: "#f9a8d4", offsetY: 34, props: { charSpacing: 200 } },
    ],
  },
  {
    id: "noel-festif", name: "Noël festif",
    cardBg: "linear-gradient(135deg, #14532d, #166534)",
    layers: [
      { text: "Joyeux", fontSize: 22, fontWeight: "normal", fontFamily: "Great Vibes", fill: "#fbbf24", offsetY: -20, props: {} },
      { text: "NOËL", fontSize: 48, fontWeight: "bold", fontFamily: "Abril Fatface", fill: "#fbbf24", offsetY: 16, props: { shadow: "2px 2px 0px #92400e" } },
    ],
  },
  {
    id: "halloween-spooky", name: "Halloween",
    cardBg: "#0a0a0a",
    layers: [
      { text: "HAPPY", fontSize: 16, fontWeight: "bold", fontFamily: "Montserrat", fill: "#f97316", offsetY: -28, props: { charSpacing: 600 } },
      { text: "Halloween", fontSize: 40, fontWeight: "bold", fontFamily: "Creepster", fill: "#f97316", offsetY: 6, props: { shadow: "0px 0px 15px #f97316" } },
    ],
  },
  {
    id: "st-patrick", name: "St Patrick",
    cardBg: "linear-gradient(135deg, #14532d, #166534)",
    layers: [
      { text: "HAPPY", fontSize: 14, fontWeight: "bold", fontFamily: "Montserrat", fill: "#86efac", offsetY: -28, props: { charSpacing: 500 } },
      { text: "St Patrick's", fontSize: 36, fontWeight: "bold", fontFamily: "Lobster", fill: "#4ade80", offsetY: 4, props: { shadow: "2px 2px 0px #15803d" } },
    ],
  },
  {
    id: "nouvel-an", name: "Nouvel An",
    cardBg: "linear-gradient(135deg, #1a1a2e, #312e81)",
    layers: [
      { text: "BONNE ANNÉE", fontSize: 14, fontWeight: "bold", fontFamily: "Montserrat", fill: "#fbbf24", offsetY: -28, props: { charSpacing: 400 } },
      { text: "2026", fontSize: 52, fontWeight: "bold", fontFamily: "Bebas Neue", fill: "#fbbf24", offsetY: 14, props: { shadow: "0px 0px 15px #fbbf24" } },
    ],
  },
  {
    id: "prom-night", name: "Bal de promo",
    cardBg: "linear-gradient(135deg, #312e81, #581c87)",
    layers: [
      { text: "PROM", fontSize: 14, fontWeight: "bold", fontFamily: "Montserrat", fill: "#c7d2fe", offsetY: -28, props: { charSpacing: 600 } },
      { text: "Night", fontSize: 44, fontWeight: "bold", fontFamily: "Great Vibes", fill: "#e9d5ff", offsetY: 4, props: { shadow: "0px 0px 12px #a5b4fc" } },
    ],
  },
  {
    id: "corporate-event", name: "Séminaire",
    cardBg: "#ffffff",
    layers: [
      { text: "CONVENTION 2025", fontSize: 10, fontWeight: "600", fontFamily: "Montserrat", fill: "#6b7280", offsetY: -30, props: { charSpacing: 400 } },
      { text: "Notre Entreprise", fontSize: 30, fontWeight: "bold", fontFamily: "Poppins", fill: "#1a1a2e", offsetY: 0, props: {} },
      { text: "ENSEMBLE, ON VA PLUS LOIN", fontSize: 8, fontWeight: "600", fontFamily: "Montserrat", fill: "#9ca3af", offsetY: 26, props: { charSpacing: 200 } },
    ],
  },
  {
    id: "retraite", name: "Départ retraite",
    cardBg: "linear-gradient(135deg, #fef3c7, #fef9c3)",
    layers: [
      { text: "Bonne retraite", fontSize: 32, fontWeight: "bold", fontFamily: "Dancing Script", fill: "#92400e", offsetY: -10, props: {} },
      { text: "JEAN-PIERRE !", fontSize: 20, fontWeight: "bold", fontFamily: "Montserrat", fill: "#b45309", offsetY: 22, props: { charSpacing: 200 } },
    ],
  },
  // ── Style-driven combos (inspired by Canva) ──
  {
    id: "pool-party", name: "Pool Party",
    cardBg: "#ffffff",
    layers: [
      { text: "POOL", fontSize: 48, fontWeight: "bold", fontFamily: "Fredoka", fill: "#5eead4", offsetY: -18, props: {} },
      { text: "PARTY", fontSize: 48, fontWeight: "bold", fontFamily: "Fredoka", fill: "#5eead4", offsetY: 24, props: {} },
    ],
  },
  {
    id: "make-it-pop", name: "Make it Pop",
    cardBg: "#ffffff",
    layers: [
      { text: "MAKE IT", fontSize: 20, fontWeight: "bold", fontFamily: "Montserrat", fill: "#374151", offsetY: -26, props: {} },
      { text: "POP", fontSize: 56, fontWeight: "bold", fontFamily: "Lilita One", fill: "#f97316", offsetY: 14, props: { stroke: "#ea580c", strokeWidth: 3, paintFirst: "stroke", shadow: "4px 4px 0px #e9d5ff" } },
    ],
  },
  {
    id: "color-pop", name: "Color Pop",
    cardBg: "#fef9c3",
    layers: [
      { text: "color", fontSize: 40, fontWeight: "bold", fontFamily: "Fredoka", fill: "#f97316", offsetY: -18, props: { stroke: "#ea580c", strokeWidth: 2, paintFirst: "stroke" } },
      { text: "pop", fontSize: 46, fontWeight: "bold", fontFamily: "Fredoka", fill: "#3b82f6", offsetY: 22, props: { stroke: "#84cc16", strokeWidth: 4, paintFirst: "stroke" } },
    ],
  },
  {
    id: "shine-repeat", name: "Shine x3",
    cardBg: "#fffbeb",
    layers: [
      { text: "SHINE", fontSize: 36, fontWeight: "bold", fontFamily: "Anton", fill: "#fbbf24", offsetY: -26, props: { shadow: "0px 0px 8px #fbbf2460" } },
      { text: "SHINE", fontSize: 36, fontWeight: "bold", fontFamily: "Anton", fill: "#fcd34d", offsetY: 0, props: { shadow: "0px 0px 8px #fbbf2440" } },
      { text: "SHINE", fontSize: 36, fontWeight: "bold", fontFamily: "Anton", fill: "#fde68a", offsetY: 26, props: { shadow: "0px 0px 8px #fbbf2420" } },
    ],
  },
  {
    id: "spring-mood", name: "Spring Mood",
    cardBg: "#ffffff",
    layers: [
      { text: "Spring", fontSize: 32, fontWeight: "bold", fontFamily: "Dancing Script", fill: "#166534", offsetY: -18, props: {} },
      { text: "MOOD", fontSize: 44, fontWeight: "bold", fontFamily: "Fredoka", fill: "#f9a8d4", offsetY: 18, props: { stroke: "#ec4899", strokeWidth: 2, paintFirst: "stroke" } },
    ],
  },
  {
    id: "player-one", name: "Player One",
    cardBg: "#1a1a2e",
    layers: [
      { text: "player", fontSize: 36, fontWeight: "bold", fontFamily: "Righteous", fill: "#ec4899", offsetY: -14, props: { shadow: "3px 0px 0px #06b6d4" } },
      { text: "one", fontSize: 36, fontWeight: "bold", fontFamily: "Righteous", fill: "#ec4899", offsetY: 18, props: { shadow: "3px 0px 0px #06b6d4" } },
    ],
  },
  {
    id: "cute-button", name: "Cute as a button",
    cardBg: "#ffffff",
    layers: [
      { text: "CUTE", fontSize: 28, fontWeight: "bold", fontFamily: "Fredoka", fill: "#d8b4fe", offsetY: -22, props: {} },
      { text: "as a", fontSize: 14, fontWeight: "normal", fontFamily: "Inter", fill: "#9ca3af", offsetY: -2, props: {} },
      { text: "BUTTON", fontSize: 36, fontWeight: "bold", fontFamily: "Fredoka", fill: "#f9a8d4", offsetY: 22, props: { stroke: "#ec4899", strokeWidth: 2, paintFirst: "stroke" } },
    ],
  },
  {
    id: "summer-specials", name: "Summer vibes",
    cardBg: "#ffffff",
    layers: [
      { text: "SUM", fontSize: 52, fontWeight: "bold", fontFamily: "Anton", fill: "#f97316", offsetY: -22, props: {} },
      { text: "MER", fontSize: 52, fontWeight: "bold", fontFamily: "Anton", fill: "#f97316", offsetY: 22, props: {} },
    ],
  },
  {
    id: "xoxo", name: "XOXO",
    cardBg: "#ffffff",
    layers: [
      { text: "XOXO", fontSize: 48, fontWeight: "bold", fontFamily: "Playfair Display", fill: "#be185d", offsetY: 0, props: { stroke: "#f9a8d4", strokeWidth: 3, paintFirst: "stroke", shadow: "3px 3px 0px #fce7f3" } },
    ],
  },
  {
    id: "green-lit", name: "Green Lit",
    cardBg: "#ffffff",
    layers: [
      { text: "GREEN", fontSize: 24, fontWeight: "bold", fontFamily: "Montserrat", fill: "#16a34a", offsetY: -22, props: {} },
      { text: "LIT", fontSize: 52, fontWeight: "bold", fontFamily: "Anton", fill: "#ffffff", offsetY: 14, props: { stroke: "#d1d5db", strokeWidth: 2, paintFirst: "stroke", shadow: "0px 0px 15px #22c55e" } },
    ],
  },
  {
    id: "love-it", name: "Love it!",
    cardBg: "#ffffff",
    layers: [
      { text: "LOVE IT!", fontSize: 44, fontWeight: "bold", fontFamily: "Pacifico", fill: "#f9a8d4", offsetY: 0, props: { stroke: "#ffffff", strokeWidth: 3, paintFirst: "stroke", shadow: "0px 0px 8px #f9a8d450" } },
    ],
  },
  {
    id: "custom-paint", name: "Custom Paint",
    cardBg: "#ffffff",
    layers: [
      { text: "CUSTOM", fontSize: 20, fontWeight: "bold", fontFamily: "Montserrat", fill: "#6b7280", offsetY: -24, props: { charSpacing: 400 } },
      { text: "PAINT", fontSize: 48, fontWeight: "bold", fontFamily: "Permanent Marker", fill: "#f97316", offsetY: 14, props: {} },
    ],
  },
  {
    id: "say-cheese", name: "Say Cheese",
    cardBg: "linear-gradient(135deg, #fdf2f8, #e0e7ff)",
    layers: [
      { text: "say", fontSize: 22, fontWeight: "normal", fontFamily: "Dancing Script", fill: "#4f46e5", offsetY: -20, props: {} },
      { text: "CHEESE!", fontSize: 44, fontWeight: "bold", fontFamily: "Lilita One", fill: "#ec4899", offsetY: 16, props: { stroke: "#be185d", strokeWidth: 2, paintFirst: "stroke" } },
    ],
  },
  {
    id: "best-day-ever", name: "Best Day Ever",
    cardBg: "linear-gradient(135deg, #fef3c7, #fef9c3)",
    layers: [
      { text: "BEST DAY", fontSize: 16, fontWeight: "bold", fontFamily: "Montserrat", fill: "#92400e", offsetY: -24, props: { charSpacing: 400 } },
      { text: "Ever", fontSize: 44, fontWeight: "bold", fontFamily: "Great Vibes", fill: "#b45309", offsetY: 10, props: { shadow: "0px 2px 6px rgba(180,83,9,0.2)" } },
    ],
  },
  {
    id: "photo-time", name: "Photo Time",
    cardBg: "#1a1a2e",
    layers: [
      { text: "C'EST L'HEURE", fontSize: 12, fontWeight: "bold", fontFamily: "Montserrat", fill: "#fbbf24", offsetY: -26, props: { charSpacing: 500 } },
      { text: "PHOTO!", fontSize: 48, fontWeight: "bold", fontFamily: "Bebas Neue", fill: "#fbbf24", offsetY: 12, props: { shadow: "0px 0px 12px #fbbf24" } },
    ],
  },
  // ── With background blocks ──
  {
    id: "vacances-card", name: "Les vacances",
    cardBg: "#f5f5f4",
    layers: [
      { text: "RETROUVEZ NOTRE PROGRAMME", fontSize: 9, fontWeight: "600", fontFamily: "Montserrat", fill: "#374151", offsetY: -38, props: { charSpacing: 300 } },
      { text: "C'est les\nvacances !", fontSize: 34, fontWeight: "bold", fontFamily: "Caveat", fill: "#1a1a2e", offsetY: 0, props: {} },
      { text: "Plein de surprises à découvrir !", fontSize: 10, fontWeight: "normal", fontFamily: "Inter", fill: "#9ca3af", offsetY: 38, props: {} },
    ],
  },
  {
    id: "st-valentin", name: "Saint-Valentin",
    cardBg: "#f5f5f4",
    layers: [
      { text: "MON AMOUR,", fontSize: 10, fontWeight: "600", fontFamily: "Montserrat", fill: "#6b7280", offsetY: -36, props: { charSpacing: 300 } },
      { text: "Bonne\nSaint-Valentin !", fontSize: 32, fontWeight: "bold", fontFamily: "Caveat", fill: "#1a1a2e", offsetY: 0, props: {} },
      { text: "Je t'aime, tout simplement", fontSize: 10, fontWeight: "normal", fontFamily: "Dancing Script", fill: "#9ca3af", offsetY: 36, props: {} },
    ],
  },
  {
    id: "youre-welcome", name: "You're welcome",
    cardBg: "#ffffff",
    layers: [
      { text: "YOU'RE", fontSize: 36, fontWeight: "bold", fontFamily: "Montserrat", fill: "#f97316", offsetY: -16, props: { charSpacing: 200 } },
      { text: "WELCOME", fontSize: 36, fontWeight: "bold", fontFamily: "Montserrat", fill: "#ec4899", offsetY: 18, props: { charSpacing: 200 } },
    ],
  },
  {
    id: "tag-blocks", name: "Tag Blocks",
    cardBg: "#ffffff",
    layers: [
      { text: "   Souriez   ", fontSize: 28, fontWeight: "bold", fontFamily: "Roboto Mono", fill: "#1a1a2e", offsetY: -16, props: { backgroundColor: "#fbbf24" } },
      { text: "   Merci !   ", fontSize: 28, fontWeight: "bold", fontFamily: "Roboto Mono", fill: "#1a1a2e", offsetY: 20, props: { backgroundColor: "#60a5fa" } },
    ],
  },
  {
    id: "habitat-bold", name: "Marque bold",
    cardBg: "#ffffff",
    layers: [
      { text: "Selfizee", fontSize: 38, fontWeight: "bold", fontFamily: "Pacifico", fill: "#22c55e", offsetY: -14, props: { stroke: "#166534", strokeWidth: 3, paintFirst: "stroke" } },
      { text: "PHOTOBOOTH", fontSize: 22, fontWeight: "bold", fontFamily: "Montserrat", fill: "#1e3a8a", offsetY: 22, props: { charSpacing: 300 } },
    ],
  },
  {
    id: "highlight-label", name: "Highlight",
    cardBg: "#ffffff",
    layers: [
      { text: "  ÉVÉNEMENT  ", fontSize: 14, fontWeight: "bold", fontFamily: "Montserrat", fill: "#ffffff", offsetY: -20, props: { backgroundColor: "#4f46e5" } },
      { text: "  SPÉCIAL  ", fontSize: 14, fontWeight: "bold", fontFamily: "Montserrat", fill: "#ffffff", offsetY: 4, props: { backgroundColor: "#ec4899" } },
      { text: "Ne manquez pas ça !", fontSize: 11, fontWeight: "normal", fontFamily: "Inter", fill: "#6b7280", offsetY: 26, props: {} },
    ],
  },
  {
    id: "merci-bg", name: "Merci encadré",
    cardBg: "#fef2f2",
    layers: [
      { text: "  MERCI  ", fontSize: 36, fontWeight: "bold", fontFamily: "Bebas Neue", fill: "#ffffff", offsetY: 0, props: { backgroundColor: "#ef4444" } },
    ],
  },
  {
    id: "hashtag-event", name: "Hashtag Event",
    cardBg: "linear-gradient(135deg, #0f172a, #1e293b)",
    layers: [
      { text: "#MONMARIAGE", fontSize: 20, fontWeight: "bold", fontFamily: "Montserrat", fill: "#ffffff", offsetY: -12, props: { charSpacing: 200 } },
      { text: "Julie & Antoine", fontSize: 28, fontWeight: "bold", fontFamily: "Great Vibes", fill: "#fbbf24", offsetY: 18, props: {} },
    ],
  },
];

export function PanelTextes({ onAddText, onAddCurvedText, onAddTextCombo }: {
  onAddText: (text: string, size: number, weight: string, font: string, offsetY?: number, extraProps?: Record<string, any>) => void;
  onAddCurvedText?: (...args: any[]) => void;
  onAddTextCombo?: (layers: any[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"categories" | "list">("categories");
  const [expandedCat, setExpandedCat] = useState<FontCategory | "recent" | null>(null);
  const [detailView, setDetailView] = useState<{ type: "category"; catId: FontCategory | "recent"; label: string; color: string; bg: string; preview: string } | { type: "compositions" } | { type: "styles" } | null>(null);
  const [slideDir, setSlideDir] = useState<"in" | "out">("in");
  const [recentFonts, setRecentFonts] = useState<string[]>([]);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certified, setCertified] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for "open fonts modal" events dispatched from the toolbar's
  // inline font picker so the "Importer une police" button there can
  // open this modal without tight coupling.
  useEffect(() => {
    const handler = () => setShowUpload(true);
    window.addEventListener("selfizee:open-fonts-modal", handler);
    return () => window.removeEventListener("selfizee:open-fonts-modal", handler);
  }, []);

  // Fetch custom fonts from API — updates the shared registry which
  // broadcasts to all subscribers (panel + toolbar font picker).
  const fetchCustomFonts = useCallback(async () => {
    await fetchCustomFontsFromApi();
  }, []);

  useEffect(() => {
    setRecentFonts(getRecentFonts());
    fetchCustomFonts();
    // Keep local state in sync with the shared custom-fonts registry
    const unsub = subscribeCustomFonts(setCustomFonts);
    // Preload ALL fonts in small batches for instant previews
    let i = 0;
    const batch = () => {
      const slice = FONT_LIST.slice(i, i + 8);
      slice.forEach(f => loadGoogleFont(f.name));
      i += 8;
      if (i < FONT_LIST.length) setTimeout(batch, 100);
    };
    batch();
    return () => unsub();
  }, [fetchCustomFonts]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return searchFonts(search);
  }, [search]);

  const handleAddFont = useCallback((font: string, previewText?: string) => {
    loadGoogleFont(font);
    const updated = addRecentFont(font);
    setRecentFonts(updated);
    const text = previewText || FONT_CATEGORIES.find(c => FONT_LIST.find(f => f.name === font)?.category === c.id)?.preview || "Votre texte";
    document.fonts.ready.then(() => onAddText(text, 32, "bold", font));
  }, [onAddText]);

  const handleUploadFonts = useCallback(async (files: File[]): Promise<CustomFont[]> => {
    if (!files.length) return [];
    setUploading(true);
    const imported: CustomFont[] = [];
    const errors: string[] = [];
    try {
      const { fetchWithTimeout } = await import("../canvas/canvasUtils");
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("certified", "true");
          // 60s for uploads — font files can be a few MB on slow connections.
          const res = await fetchWithTimeout(apiUrl("/api/fonts"), { method: "POST", body: fd, timeoutMs: 60000 });
          const data = await res.json();
          if (!res.ok) {
            errors.push(`${file.name}: ${data.error || "erreur"}`);
            continue;
          }
          loadCustomFontFace(data);
          imported.push(data as CustomFont);
        } catch {
          errors.push(`${file.name}: erreur réseau`);
        }
      }
      await fetchCustomFonts();
      // Success celebration is driven in-modal from the returned fonts.
      // Only surface errors as a toast; no success toast.
      if (errors.length > 0) {
        toast(errors.length === 1 ? errors[0] : `${errors.length} erreurs d'import`, "error");
      }
      setCertified(false);
      return imported;
    } finally {
      setUploading(false);
    }
  }, [fetchCustomFonts]);

  const handleDeleteFont = useCallback(async (font: CustomFont) => {
    try {
      const { fetchWithTimeout } = await import("../canvas/canvasUtils");
      const res = await fetchWithTimeout(apiUrl("/api/fonts"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: font.fileName }),
        timeoutMs: 15000,
      });
      if (res.ok) {
        // Optimistically update the shared registry so the toolbar picker
        // removes the font immediately too.
        setSharedCustomFonts(customFonts.filter(f => f.fileName !== font.fileName));
        await fetchCustomFonts();
        toast(`"${font.displayName}" supprimée`, "info");
      }
    } catch { toast("Erreur", "error"); }
  }, [fetchCustomFonts, customFonts]);

  const toggleCategory = useCallback((cat: FontCategory | "recent") => {
    setExpandedCat(prev => prev === cat ? null : cat);
  }, []);

  const fontsForCategory = useCallback((cat: FontCategory) => FONT_LIST.filter(f => f.category === cat), []);

  // ── Detail view: full-page slide for a category, compositions, or styles ──
  if (detailView) {
    const goBack = () => {
      setSlideDir("out");
      setTimeout(() => { setDetailView(null); setSlideDir("in"); }, 150);
    };
    let title = "";
    let items: React.ReactNode = null;

    if (detailView.type === "category") {
      const fonts = detailView.catId === "recent"
        ? recentFonts.map(name => FONT_LIST.find(f => f.name === name)).filter(Boolean) as typeof FONT_LIST
        : FONT_LIST.filter(f => f.category === detailView.catId);
      title = detailView.label;
      items = (
        <div className="grid grid-cols-2 gap-2">
          {fonts.map(f => (
            <HoverPreview key={f.name} preview={
              <div className="py-6 px-5" style={{ backgroundColor: detailView.bg, borderRadius: 12 }}>
                <span className="block text-[32px] leading-tight" style={{ fontFamily: `'${f.name}', sans-serif`, color: detailView.color, whiteSpace: "nowrap" }}>{detailView.preview}</span>
                <span className="block text-[12px] text-gray-400 mt-2">{f.name}</span>
              </div>
            }>
              <button onClick={() => handleAddFont(f.name, detailView.preview)}
                className="w-full text-left rounded-xl overflow-hidden hover:shadow-md transition-all" style={{ backgroundColor: detailView.bg }}>
                <div className="px-3 py-4">
                  <span className="block text-[18px] leading-tight overflow-hidden" style={{ fontFamily: `'${f.name}', sans-serif`, color: detailView.color, whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{detailView.preview}</span>
                  <span className="block text-[10px] text-gray-400 mt-1.5">{f.name}</span>
                </div>
              </button>
            </HoverPreview>
          ))}
        </div>
      );
    } else if (detailView.type === "compositions") {
      title = "Compositions";
      const renderComboLayers = (layers: typeof TEXT_COMBO_PRESETS[0]["layers"], scale: number) => layers.map((l, i) => (
        <span key={i} className="block leading-tight truncate w-full" style={{
          fontFamily: `'${l.fontFamily}', sans-serif`, fontSize: `${Math.min(l.fontSize * scale, scale * 48)}px`,
          fontWeight: l.fontWeight === "bold" ? 700 : 400, color: l.fill || "#1a1a2e",
          backgroundColor: l.props?.backgroundColor || undefined, padding: l.props?.backgroundColor ? "0 3px" : undefined, display: l.props?.backgroundColor ? "inline" : undefined,
          WebkitTextStroke: l.props?.strokeWidth ? `${Math.min(l.props.strokeWidth * scale * 0.7, 2)}px ${l.props.stroke || "#000"}` : undefined,
          textShadow: l.props?.shadow ? l.props.shadow.replace(/(\d+)px/g, (_: string, n: string) => `${Math.round(parseFloat(n) * scale * 0.7)}px`) : undefined,
        }}>{l.text.trim()}</span>
      ));
      items = (
        <div className="grid grid-cols-2 gap-2">
          {TEXT_COMBO_PRESETS.map(combo => (
            <HoverPreview key={combo.id} preview={
              <div className="flex flex-col justify-center items-center text-center py-6 px-3" style={{ background: combo.cardBg, borderRadius: 12 }}>
                {renderComboLayers(combo.layers, 0.7)}
                <span className="text-[10px] text-gray-500 mt-2">{combo.name}</span>
              </div>
            }>
              <button
                onClick={() => { combo.layers.forEach(l => loadGoogleFont(l.fontFamily)); document.fonts.ready.then(() => onAddTextCombo?.(combo.layers)); }}
                className="w-full text-left rounded-xl overflow-hidden hover:shadow-md transition-all border border-gray-100" style={{ background: combo.cardBg }}>
                <div className="px-3 py-3 h-[90px] flex flex-col justify-center items-center text-center">
                  {renderComboLayers(combo.layers, 0.38)}
                </div>
                <div className="px-2 pb-1.5"><span className="text-[8px] text-gray-400 truncate block text-center">{combo.name}</span></div>
              </button>
            </HoverPreview>
          ))}
        </div>
      );
    } else if (detailView.type === "styles") {
      title = "Styles";
      items = (
        <div className="grid grid-cols-2 gap-2">
          {TEXT_STYLE_PRESETS.map(preset => (
            <HoverPreview key={preset.id} preview={
              <div className="py-6 px-5 flex flex-col justify-center" style={{ background: preset.cardBg, borderRadius: 12 }}>
                <span className="block text-[36px] leading-tight" style={{ fontFamily: `'${preset.font}', sans-serif`, color: preset.cardColor, textShadow: preset.cardShadow || "none", WebkitTextStroke: preset.cardStroke || "unset", fontWeight: preset.weight === "bold" ? 700 : 400 }}>{preset.text}</span>
                <span className="block text-[11px] mt-2" style={{ color: preset.cardSubColor || "#999" }}>{preset.name}</span>
              </div>
            }>
              <button
                onClick={() => { loadGoogleFont(preset.font); addRecentFont(preset.font); setRecentFonts(getRecentFonts()); document.fonts.ready.then(() => onAddText(preset.text, preset.size, preset.weight, preset.font, 0, preset.props)); }}
                className="w-full text-left rounded-xl overflow-hidden hover:shadow-md transition-all" style={{ background: preset.cardBg }}>
                <div className="px-3 py-3 h-[70px] flex flex-col justify-center">
                  <span className="block text-[18px] leading-tight truncate" style={{ fontFamily: `'${preset.font}', sans-serif`, color: preset.cardColor, textShadow: preset.cardShadow || "none", WebkitTextStroke: preset.cardStroke || "unset", fontWeight: preset.weight === "bold" ? 700 : 400 }}>{preset.text}</span>
                  <span className="block text-[8px] mt-1 truncate" style={{ color: preset.cardSubColor || "#999" }}>{preset.name}</span>
                </div>
              </button>
            </HoverPreview>
          ))}
        </div>
      );
    }

    return (
      <div className={slideDir === "in" ? "animate-[panelSlideIn_0.2s_ease-out]" : "animate-[panelSlideOut_0.15s_ease-in_forwards]"}>
        <style>{`
          @keyframes panelSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes panelSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        `}</style>
        <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-[#4f46e5] font-medium hover:underline mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <h3 className="text-sm font-bold text-gray-800 mb-3">{title}</h3>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          {items}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* ── CTA: Ajouter un titre (primary action) ── */}
      <button onClick={() => { addRecentFont("Montserrat"); onAddText("Ajouter un titre", 48, "bold", "Montserrat"); }}
        className="w-full py-2.5 rounded-xl bg-[#4f46e5] text-white font-semibold text-sm shadow-sm hover:bg-[#4338ca] hover:shadow-md transition-all active:scale-[0.98]">
        + Ajouter un titre
      </button>
      {/* ── Secondary add buttons ── */}
      <div className="flex gap-1.5">
        <button onClick={() => { addRecentFont("Montserrat"); onAddText("Sous-titre", 28, "600", "Montserrat"); }}
          className="flex-1 py-1.5 rounded-lg text-[#4f46e5] font-medium text-xs bg-purple-50 border border-purple-100 hover:border-[#4f46e5] transition-all active:scale-[0.97]">Sous-titre</button>
        <button onClick={() => { addRecentFont("Inter"); onAddText("Texte", 18, "normal", "Inter"); }}
          className="flex-1 py-1.5 rounded-lg text-gray-500 font-medium text-xs bg-gray-50 border border-gray-200 hover:border-gray-400 transition-all active:scale-[0.97]">Corps de texte</button>
      </div>

      {/* ── Text combos (Canva-style multi-layer) ── */}
      {onAddTextCombo && (
        <ScrollStrip label="Compositions" onSeeAll={() => setDetailView({ type: "compositions" })}>
            {TEXT_COMBO_PRESETS.map(combo => (
              <HoverPreview key={combo.id} preview={
                <div className="flex flex-col justify-center items-center text-center py-5 px-3" style={{ background: combo.cardBg, borderRadius: 12 }}>
                  {combo.layers.map((l, i) => (
                    <span key={i} className="block leading-tight truncate w-full" style={{
                      fontFamily: `'${l.fontFamily}', sans-serif`, fontSize: `${Math.min(l.fontSize * 0.6, 28)}px`,
                      fontWeight: l.fontWeight === "bold" ? 700 : 400, color: l.fill || "#1a1a2e",
                      WebkitTextStroke: l.props?.strokeWidth ? `${Math.min(l.props.strokeWidth * 0.4, 1.5)}px ${l.props.stroke || "#000"}` : undefined,
                      textShadow: l.props?.shadow ? l.props.shadow.replace(/(\d+)px/g, (_: string, n: string) => `${Math.round(parseFloat(n) * 0.4)}px`) : undefined,
                    }}>{l.text.trim()}</span>
                  ))}
                  <span className="text-[10px] text-gray-500 mt-2">{combo.name}</span>
                </div>
              }>
              <button
                onClick={() => {
                  combo.layers.forEach(l => loadGoogleFont(l.fontFamily));
                  document.fonts.ready.then(() => onAddTextCombo(combo.layers));
                }}
                className="flex-shrink-0 w-[130px] rounded-xl overflow-hidden hover:shadow-md transition-all border border-gray-100"
                style={{ background: combo.cardBg }}
              >
                <div className="px-2 py-3 h-[80px] flex flex-col justify-center items-center text-center">
                  {combo.layers.map((l, i) => (
                    <span
                      key={i}
                      className="block leading-tight truncate w-full"
                      style={{
                        fontFamily: `'${l.fontFamily}', sans-serif`,
                        fontSize: `${Math.min(l.fontSize * 0.35, 18)}px`,
                        fontWeight: l.fontWeight === "bold" ? 700 : l.fontWeight === "600" ? 600 : 400,
                        color: l.fill || "#1a1a2e",
                        backgroundColor: l.props?.backgroundColor || undefined,
                        padding: l.props?.backgroundColor ? "1px 4px" : undefined,
                        display: l.props?.backgroundColor ? "inline" : undefined,
                        WebkitTextStroke: l.props?.strokeWidth ? `${Math.min(l.props.strokeWidth * 0.3, 1.5)}px ${l.props.stroke || "#000"}` : undefined,
                        textShadow: l.props?.shadow ? l.props.shadow.replace(/(\d+)px/g, (_: string, n: string) => `${Math.round(parseFloat(n) * 0.3)}px`) : undefined,
                      }}
                    >
                      {l.text.trim()}
                    </span>
                  ))}
                </div>
                <div className="px-2 pb-1.5">
                  <span className="text-[8px] text-gray-400 truncate block text-center">{combo.name}</span>
                </div>
              </button>
              </HoverPreview>
            ))}
        </ScrollStrip>
      )}

      {/* ── Text style presets ── */}
      <ScrollStrip label="Styles" onSeeAll={() => setDetailView({ type: "styles" })}>
          {TEXT_STYLE_PRESETS.map(preset => (
            <HoverPreview key={preset.id} preview={
              <div className="py-5 px-4 flex flex-col justify-center" style={{ background: preset.cardBg, borderRadius: 12 }}>
                <span className="block text-[32px] leading-tight" style={{ fontFamily: `'${preset.font}', sans-serif`, color: preset.cardColor, textShadow: preset.cardShadow || "none", WebkitTextStroke: preset.cardStroke || "unset", fontWeight: preset.weight === "bold" ? 700 : 400 }}>{preset.text}</span>
                <span className="block text-[10px] mt-2" style={{ color: preset.cardSubColor || "#999" }}>{preset.name}</span>
              </div>
            }>
            <button
              onClick={() => {
                loadGoogleFont(preset.font);
                addRecentFont(preset.font);
                setRecentFonts(getRecentFonts());
                document.fonts.ready.then(() => onAddText(preset.text, preset.size, preset.weight, preset.font, 0, preset.props));
              }}
              className="flex-shrink-0 w-[110px] rounded-xl overflow-hidden hover:shadow-md transition-all group"
              style={{ background: preset.cardBg }}
            >
              <div className="px-2.5 py-3 h-[72px] flex flex-col justify-center">
                <span
                  className="block text-[17px] leading-tight truncate"
                  style={{
                    fontFamily: `'${preset.font}', sans-serif`,
                    color: preset.cardColor,
                    textShadow: preset.cardShadow || "none",
                    WebkitTextStroke: preset.cardStroke || "unset",
                    fontWeight: preset.weight === "bold" ? 700 : 400,
                  }}
                >
                  {preset.text}
                </span>
                <span className="block text-[8px] mt-1 truncate" style={{ color: preset.cardSubColor || "#999" }}>{preset.name}</span>
              </div>
            </button>
            </HoverPreview>
          ))}
      </ScrollStrip>

      {/* ── Search bar + view toggle ── */}
      <div className="border-t border-gray-100 pt-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Rechercher..." value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value && viewMode === "categories") setViewMode("list"); }}
              onFocus={() => { if (search) setViewMode("list"); }}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]/30 transition-colors" />
            {search && (
              <button onClick={() => { setSearch(""); setViewMode("categories"); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {/* View toggle */}
          <button
            onClick={() => setViewMode(viewMode === "categories" ? "list" : "categories")}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${viewMode === "list" ? "border-[#4f46e5] bg-purple-50 text-[#4f46e5]" : "border-gray-200 text-gray-400 hover:text-gray-600"}`}
            title={viewMode === "categories" ? "Voir en liste" : "Voir par catégorie"}
          >
            {viewMode === "categories" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Modal: Mes polices ── */}
      {showUpload && (
        <MyFontsModal
          customFonts={customFonts}
          onClose={() => { setShowUpload(false); setCertified(false); }}
          onUpload={handleUploadFonts}
          onDelete={handleDeleteFont}
          onUseFont={(f) => {
            loadCustomFontFace(f);
            addRecentFont(f.displayName);
            setRecentFonts(getRecentFonts());
            document.fonts.ready.then(() => onAddText("Votre texte", 32, "bold", f.displayName));
            setShowUpload(false);
          }}
          uploading={uploading}
          certified={certified}
          setCertified={setCertified}
          fileInputRef={fileInputRef}
        />
      )}

      {/* ── List view (search results or full list) ── */}
      {viewMode === "list" ? (
        <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
          {(searchResults || FONT_LIST).length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">Aucune police trouvée</p>
          )}
          {(searchResults || FONT_LIST).map(f => {
            const cat = FONT_CATEGORIES.find(c => c.id === f.category);
            return (
              <button
                key={f.name}
                onClick={() => handleAddFont(f.name)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-purple-50 transition-all group flex items-center justify-between"
              >
                <span className="text-gray-800 text-[15px] truncate group-hover:text-[#4f46e5]" style={{ fontFamily: `'${f.name}', sans-serif` }}>
                  {f.name}
                </span>
                {cat && <span className="text-[9px] font-medium flex-shrink-0 ml-2 px-1.5 py-0.5 rounded-full" style={{ color: cat.color, backgroundColor: cat.bg }}>{cat.label}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        /* ── Categories view ── */
        <div className="space-y-3 overflow-y-auto -mx-4 px-4" style={{ maxHeight: "calc(100vh - 380px)" }}>
          {/* Recent fonts */}
          {recentFonts.length > 0 && (
            <CategoryRow
              catDef={{ id: "recent" as any, label: "Récents", color: "#4f46e5", bg: "#ebf0fa", preview: "Votre texte" }}
              onSeeAll={() => setDetailView({ type: "category", catId: "recent" as any, label: "Récents", color: "#4f46e5", bg: "#ebf0fa", preview: "Votre texte" })}
              fonts={recentFonts.map(name => FONT_LIST.find(f => f.name === name)).filter(Boolean) as typeof FONT_LIST}
              onAddFont={handleAddFont}
            />
          )}

          {FONT_CATEGORIES.map(cat => (
            <CategoryRow
              key={cat.id}
              catDef={cat}
              onSeeAll={() => setDetailView({ type: "category", catId: cat.id, label: cat.label, color: cat.color, bg: cat.bg, preview: cat.preview })}
              fonts={fontsForCategory(cat.id)}
              onAddFont={handleAddFont}
            />
          ))}
        </div>
      )}

      {/* ── Mes polices (bottom) ── */}
      <div className="border-t border-gray-100 pt-2">
        <button onClick={() => setShowUpload(true)}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-purple-50 transition-all group">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span className="text-xs font-medium text-gray-600">Mes polices</span>
            {customFonts.length > 0 && <span className="text-[10px] text-gray-400">({customFonts.length})</span>}
          </div>
          <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Category row: horizontal scroll → expanded grid
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   ScrollStrip — horizontal scroll with arrow buttons
   ═══════════════════════════════════════════════════════════════ */
/* Shared horizontal scroll strip with fade + arrow buttons */
function HScrollStrip({ children, size = "md" }: { children: React.ReactNode; size?: "sm" | "md" }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const btnSize = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 5);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  const doScroll = useCallback((delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    updateArrows();
    return () => el.removeEventListener("scroll", updateArrows);
  }, [updateArrows]);

  return (
    <div className="relative" style={{ overflow: "hidden" }}>
      <div ref={scrollRef} className="flex gap-1.5 px-1 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }} onWheel={(e) => { /* let vertical wheel pass through to parent */ if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.style.pointerEvents = "none"; requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.style.pointerEvents = ""; }); } }}>{children}</div>
      {/* Left arrow */}
      <div className={`absolute left-0 top-0 bottom-0 w-10 flex items-center justify-start pointer-events-none transition-opacity duration-200 ${showLeft ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to left, transparent, white 60%)" }}>
        <button onClick={() => doScroll(-200)} className={`${btnSize} rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#4f46e5] hover:border-[#4f46e5] transition-colors pointer-events-auto`}>
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>
      {/* Right arrow */}
      <div className={`absolute right-0 top-0 bottom-0 w-10 flex items-center justify-end pointer-events-none transition-opacity duration-200 ${showRight ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to right, transparent, white 60%)" }}>
        <button onClick={() => doScroll(200)} className={`${btnSize} rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#4f46e5] hover:border-[#4f46e5] transition-colors pointer-events-auto`}>
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

function ScrollStrip({ label, children, onSeeAll }: { label: string; children: React.ReactNode; onSeeAll?: () => void }) {
  return (
    <div className="border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">{label}</p>
        {onSeeAll && <button onClick={onSeeAll} className="text-[10px] font-medium text-[#4f46e5] hover:underline">Voir tout</button>}
      </div>
      <HScrollStrip>{children}</HScrollStrip>
    </div>
  );
}

function CategoryScrollStrip({ children }: { children: React.ReactNode }) {
  return <HScrollStrip size="sm">{children}</HScrollStrip>;
}

function CategoryRow({
  catDef, onSeeAll, fonts, onAddFont,
}: {
  catDef: { id: string; label: string; color: string; bg: string; preview: string };
  onSeeAll: () => void;
  fonts: { name: string; category: string }[];
  onAddFont: (font: string, preview?: string) => void;
}) {
  if (fonts.length === 0) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 px-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: catDef.color }} />
          <span className="text-[11px] font-bold text-gray-700">{catDef.label}</span>
          <span className="text-[10px] text-gray-400">{fonts.length}</span>
        </div>
        <button onClick={onSeeAll} className="text-[10px] font-medium hover:underline" style={{ color: catDef.color }}>
          Voir tout
        </button>
      </div>

      <CategoryScrollStrip>
        {fonts.map(f => (
          <div key={f.name} className="flex-shrink-0" style={{ width: "120px" }}>
            <FontCard font={f.name} catDef={catDef} onAdd={(font) => onAddFont(font, catDef.preview)} />
          </div>
        ))}
      </CategoryScrollStrip>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Hover preview — shows enlarged card next to panel
   ═══════════════════════════════════════════════════════════════ */
function HoverPreview({ children, preview }: { children: React.ReactNode; preview: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div ref={ref} className="relative flex-shrink-0"
      onMouseEnter={() => {
        timerRef.current = setTimeout(() => {
          const r = ref.current?.getBoundingClientRect();
          if (r) setPos({ top: Math.min(Math.max(20, r.top), window.innerHeight - 250) });
          setShow(true);
        }, 150);
      }}
      onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); setShow(false); }}
    >
      {children}
      {show && (
        <div className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 w-[280px] animate-[fadeScale_0.12s_ease-out]"
          style={{ top: pos.top, left: "345px" }}>
          <style>{`@keyframes fadeScale { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
          {preview}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Font card
   ═══════════════════════════════════════════════════════════════ */
function FontCard({ font, catDef, onAdd }: {
  font: string;
  catDef: { color: string; bg: string; preview: string };
  onAdd: (font: string) => void;
}) {
  return (
    <button
      onClick={() => onAdd(font)}
      className="w-full text-left rounded-lg hover:shadow-md transition-all group overflow-hidden"
      style={{ backgroundColor: catDef.bg }}
      title={font}
    >
      <div className="px-2.5 py-2.5">
        <span className="block text-[16px] leading-tight truncate" style={{ fontFamily: `'${font}', sans-serif`, color: catDef.color }}>
          {catDef.preview}
        </span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Modal: Mes polices — upload, manage, info
   ═══════════════════════════════════════════════════════════════ */
function MyFontsModal({
  customFonts, onClose, onUpload, onDelete, onUseFont, uploading, certified, setCertified, fileInputRef,
}: {
  customFonts: CustomFont[];
  onClose: () => void;
  onUpload: (files: File[]) => Promise<CustomFont[]>;
  onDelete: (f: CustomFont) => void;
  onUseFont: (f: CustomFont) => void;
  uploading: boolean;
  certified: boolean;
  setCertified: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [tab, setTab] = useState<"import" | "fonts" | "faq">(customFonts.length > 0 ? "fonts" : "import");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewFamily, setPreviewFamily] = useState<string | null>(null);
  const [successFonts, setSuccessFonts] = useState<CustomFont[] | null>(null);

  // Load a local font-face to preview the first file in the queue before
  // upload. Adding more files keeps the preview on the first one.
  const previewTargetFile = pendingFiles[0] || null;
  useEffect(() => {
    if (!previewTargetFile || typeof window === "undefined") {
      setPreviewFamily(null);
      return;
    }
    let cancelled = false;
    const family = `__preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const blobUrl = URL.createObjectURL(previewTargetFile);
    const face = new FontFace(family, `url(${blobUrl})`);
    face.load()
      .then((loaded) => {
        if (cancelled) return;
        document.fonts.add(loaded);
        setPreviewFamily(family);
      })
      .catch(() => { if (!cancelled) setPreviewFamily(null); })
      .finally(() => { URL.revokeObjectURL(blobUrl); });
    return () => {
      cancelled = true;
      try { document.fonts.delete(face); } catch {}
    };
  }, [previewTargetFile]);

  const tabs = [
    { id: "import" as const, label: "Importer", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
    { id: "fonts" as const, label: `Mes polices${customFonts.length ? ` (${customFonts.length})` : ""}`, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { id: "faq" as const, label: "Aide & droits", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  const handleConfirmUpload = async () => {
    if (pendingFiles.length === 0) return;
    if (!certified) { toast("Cochez la case pour confirmer vos droits", "info"); return; }
    const result = await onUpload(pendingFiles);
    if (result && result.length > 0) {
      setSuccessFonts(result);
      setPendingFiles([]);
      setCertified(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex ${successFonts ? "w-[520px]" : "w-[820px]"} max-w-[95vw]`} onClick={(e) => e.stopPropagation()}>
        {/* ══ Left: illustration + marketing (mirrors ShareModal) — hidden during success celebration ══ */}
        {!successFonts && (
        <div className="hidden sm:flex w-[280px] flex-shrink-0 relative flex-col items-center justify-center p-8 text-center overflow-hidden">
          {/* Vibrant gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#4f46e5] via-[#4f46e5] to-[#ec4899]" />
          {/* Decorative blobs for peps */}
          <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -right-10 w-48 h-48 rounded-full bg-[#fde047]/20 blur-3xl" />
          <div className="absolute top-1/3 right-6 w-3 h-3 rounded-full bg-white/60" />
          <div className="absolute top-20 left-10 w-2 h-2 rounded-full bg-white/50" />
          <div className="absolute bottom-24 left-14 w-2.5 h-2.5 rounded-full bg-[#fde047]/80" />

          {/* Content */}
          <div className="relative">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-5 mx-auto rotate-[-4deg] hover:rotate-0 transition-transform">
              <span className="text-[44px] leading-none font-serif font-black bg-gradient-to-br from-[#4f46e5] to-[#ec4899] bg-clip-text text-transparent" style={{ fontFamily: "'Times New Roman', serif" }}>
                Aa
              </span>
            </div>
            <h3 className="text-[17px] font-black text-white mb-2 leading-tight drop-shadow-sm">
              Votre marque,<br />votre typographie
            </h3>
            <p className="text-[11px] text-white/85 leading-relaxed mb-5">
              Importez la police de votre entreprise ou d&apos;un événement pour donner à vos cadres une identité vraiment <b className="text-white">personnelle</b>.
            </p>

            {/* Feature bullets */}
            <div className="space-y-2 text-left">
              {[
                "Usage commercial illimité",
                "Partagée avec vos collaborateurs",
                "Disponible dans tous vos projets",
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <span className="text-[11px] text-white/90 font-medium">{feat}</span>
                </div>
              ))}
            </div>

            {/* Font count chip */}
            {customFonts.length > 0 && (
              <div className="mt-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
                <span className="text-[10px] font-bold text-white">{customFonts.length}</span>
                <span className="text-[10px] text-white/90">police{customFonts.length > 1 ? "s" : ""} importée{customFonts.length > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ══ Right: form ══ */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Floating close button — always visible, over content during success celebration */}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${successFonts ? "text-gray-300 hover:text-gray-600 hover:bg-gray-100" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          {/* Header — hidden during success celebration */}
          {!successFonts && (
            <div className="px-6 pt-5 pb-0 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#0d1216]">Mes polices</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Importez et gérez vos polices personnalisées</p>
                </div>
              </div>
              {/* Tabs — segmented pill control */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold rounded-lg transition-all ${
                      tab === t.id
                        ? "bg-gradient-to-r from-[#4f46e5] to-[#4f46e5] text-white shadow-md shadow-purple-200"
                        : "text-gray-600 hover:text-[#4f46e5] hover:bg-white"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* ═══ Success celebration (replaces all tabs on successful import) ═══ */}
          {successFonts && successFonts.length > 0 && (
            <div className="text-center py-6 px-2">
              <div className="relative w-20 h-20 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#ec4899] opacity-20 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#ec4899] flex items-center justify-center shadow-lg">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-1">
                {successFonts.length === 1
                  ? "Parfait, c'est importé ! 🎉"
                  : `Bravo, ${successFonts.length} polices importées ! 🎉`}
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                {successFonts.length === 1 ? (
                  <><b className="text-gray-700">{successFonts[0].displayName}</b> est maintenant dans votre bibliothèque</>
                ) : (
                  <>Vos nouvelles polices sont prêtes à être utilisées</>
                )}
              </p>

              {/* Preview — big single preview, or compact list for multiple */}
              {successFonts.length === 1 ? (
                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-6 mb-5">
                  <div className="text-[42px] leading-none text-gray-800 mb-2 truncate" style={{ fontFamily: `'${successFonts[0].displayName}', sans-serif` }}>
                    Aa Bb Cc 123
                  </div>
                  <div className="text-base text-gray-600 truncate" style={{ fontFamily: `'${successFonts[0].displayName}', sans-serif` }}>
                    The quick brown fox jumps over the lazy dog
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-4 mb-5 space-y-2 text-left max-h-[220px] overflow-y-auto">
                  {successFonts.map((f) => (
                    <button
                      key={f.fileName}
                      onClick={() => onUseFont(f)}
                      className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/70 transition-colors group"
                      title={`Utiliser ${f.displayName}`}
                    >
                      <span className="text-[24px] leading-none text-gray-800 truncate flex-shrink-0" style={{ fontFamily: `'${f.displayName}', sans-serif` }}>Abc 123</span>
                      <span className="text-[11px] text-gray-500 truncate flex-1 text-left">{f.displayName}</span>
                      <span className="text-[10px] text-[#4f46e5] font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">Utiliser →</span>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
                {successFonts.length === 1 ? "Votre police est accessible" : "Vos polices sont accessibles"} dans tous vos projets et {successFonts.length === 1 ? "partagée" : "partagées"} avec vos collaborateurs.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => { onUseFont(successFonts[0]); }}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  {successFonts.length === 1
                    ? "Utiliser cette police maintenant"
                    : `Utiliser « ${successFonts[0].displayName} »`}
                </button>
                <button
                  onClick={() => { setSuccessFonts(null); setTab("import"); }}
                  className="w-full py-2.5 rounded-xl text-xs font-medium text-gray-500 hover:text-[#4f46e5] hover:bg-purple-50 transition-colors"
                >
                  Importer d&apos;autres polices
                </button>
              </div>
            </div>
          )}

          {/* ═══ TAB: Importer ═══ */}
          {!successFonts && tab === "import" && (
            <div className="space-y-4">
              {/* Upload zone */}
              <div className="rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/40 p-5 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-[#4f46e5] flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Importer une police</p>
                  <p className="text-[11px] text-gray-400 mt-1">Formats : .woff2, .woff, .ttf, .otf — Max 50 Mo</p>
                </div>

                {/* File picker — multi-select, additive */}
                <input
                  // Port booth-ui (React 19) → Kalifun (React 18) : le typage
                  // RefObject a un `current` nullable, resserré ici pour le
                  // ref DOM attendu par @types/react 18.
                  ref={fileInputRef as React.RefObject<HTMLInputElement>}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length) {
                      setPendingFiles(prev => {
                        // Deduplicate by name+size to avoid double-adding the same file
                        const key = (f: File) => `${f.name}__${f.size}`;
                        const seen = new Set(prev.map(key));
                        return [...prev, ...picked.filter(f => !seen.has(key(f)))];
                      });
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-white border-2 border-purple-200 text-[#4f46e5] hover:bg-purple-50 hover:border-[#4f46e5] transition-all"
                >
                  {pendingFiles.length > 0 ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Ajouter d&apos;autres fichiers
                    </span>
                  ) : "Choisir un ou plusieurs fichiers"}
                </button>

                {/* File list */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                    {pendingFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <svg className="w-4 h-4 text-[#4f46e5] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-[11px] text-gray-700 truncate flex-1">{f.name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} Ko</span>
                        <button
                          onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                          disabled={uploading}
                          className="w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                          title="Retirer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live preview — first file in the queue */}
                {pendingFiles.length > 0 && (
                  <div className="rounded-xl bg-white border border-purple-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400">Aperçu</p>
                      {pendingFiles.length > 1 && (
                        <p className="text-[9px] text-gray-400">
                          ({pendingFiles[0].name} + {pendingFiles.length - 1} autre{pendingFiles.length > 2 ? "s" : ""})
                        </p>
                      )}
                    </div>
                    {previewFamily ? (
                      <>
                        <div className="text-[32px] leading-none text-gray-800 mb-1 truncate" style={{ fontFamily: `'${previewFamily}', sans-serif` }}>
                          Aa Bb Cc 123
                        </div>
                        <div className="text-[13px] text-gray-600 truncate" style={{ fontFamily: `'${previewFamily}', sans-serif` }}>
                          The quick brown fox jumps over the lazy dog
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-400 italic">Chargement de l&apos;aperçu…</p>
                    )}
                  </div>
                )}

                {/* Certification + confirm (once at least one file is queued) */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer bg-white rounded-xl p-3.5 border border-purple-100 hover:border-[#4f46e5]/40 transition-colors">
                      <input
                        type="checkbox"
                        checked={certified}
                        onChange={(e) => setCertified(e.target.checked)}
                        className="mt-0.5 accent-[#4f46e5] w-4 h-4 rounded flex-shrink-0"
                      />
                      <div className="flex-1">
                        <span className="text-[12px] text-gray-800 font-semibold leading-snug block">
                          Je certifie disposer des droits d&apos;utilisation de {pendingFiles.length > 1 ? "ces polices" : "cette police"} pour un usage commercial.
                        </span>
                        <span className="text-[11px] text-gray-500 leading-relaxed block mt-1">
                          Selfizee n&apos;est pas responsable des polices importées — vous restez seul
                          responsable des droits (commerciaux, événementiels, impression).{" "}
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setTab("faq"); }}
                            className="text-[#4f46e5] font-medium hover:underline"
                          >
                            En savoir plus
                          </button>
                        </span>
                      </div>
                    </label>

                    <button
                      onClick={handleConfirmUpload}
                      disabled={uploading || !certified}
                      className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${certified && !uploading ? "bg-[#4f46e5] text-white hover:bg-[#4338ca] shadow-sm hover:shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                    >
                      {uploading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Import en cours…
                        </span>
                      ) : pendingFiles.length > 1
                        ? `Confirmer l\u2019import (${pendingFiles.length} polices)`
                        : "Confirmer l\u2019import"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TAB: Mes polices ═══ */}
          {!successFonts && tab === "fonts" && (
            <div>
              {customFonts.length > 0 ? (
                <div className="space-y-1.5">
                  {customFonts.map(f => {
                    loadCustomFontFace(f);
                    return (
                      <div key={f.fileName} className="flex items-center justify-between px-3 py-3 rounded-xl bg-gray-50 hover:bg-purple-50 transition-colors group">
                        <button onClick={() => onUseFont(f)} className="flex-1 min-w-0 text-left">
                          <span className="text-[20px] text-gray-700 block truncate group-hover:text-[#4f46e5] transition-colors" style={{ fontFamily: `'${f.displayName}', sans-serif` }}>
                            Abc 123 !?
                          </span>
                          <span className="text-[10px] text-gray-400 mt-0.5 block">{f.displayName}</span>
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                          <button
                            onClick={() => onUseFont(f)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#4f46e5] bg-purple-100 hover:bg-purple-200 transition-colors"
                          >
                            Utiliser
                          </button>
                          <button
                            onClick={() => onDelete(f)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Aucune police importée</p>
                  <p className="text-[11px] text-gray-400 mt-1 mb-4">Vos polices seront accessibles dans tous vos projets</p>
                  <button onClick={() => setTab("import")} className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors">
                    Importer ma première police
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB: FAQ & droits ═══ */}
          {!successFonts && tab === "faq" && (
            <div className="space-y-4">
              {/* Disclaimer */}
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="flex gap-2.5">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <div>
                    <p className="text-xs font-bold text-red-700 mb-1">Responsabilité de l&apos;utilisateur</p>
                    <p className="text-[11px] text-red-600 leading-relaxed">
                      Selfizee ne saurait être tenu responsable de l&apos;utilisation de polices importées par ses utilisateurs.
                      En important une police, vous déclarez sur l&apos;honneur disposer de tous les droits nécessaires à son utilisation
                      dans un cadre commercial (événements, impressions, diffusion numérique).
                      En cas de litige lié aux droits d&apos;une police, la responsabilité incombe entièrement à l&apos;utilisateur ayant procédé à l&apos;import.
                    </p>
                  </div>
                </div>
              </div>

              {/* FAQ items */}
              {[
                {
                  q: "Où trouver des polices libres de droits ?",
                  a: "Google Fonts propose des centaines de polices gratuites et libres pour un usage commercial. Font Squirrel est aussi une excellente ressource. Sur DaFont, vérifiez toujours la licence de chaque police (certaines sont \"free for personal use\" uniquement).",
                },
                {
                  q: "Quels formats sont acceptés ?",
                  a: "Nous acceptons les formats .woff2 (recommandé, le plus léger), .woff, .ttf et .otf. La taille maximale est de 50 Mo par fichier. Pour convertir vos polices en .woff2, utilisez fontsquirrel.com/tools/webfont-generator.",
                },
                {
                  q: "Qui peut utiliser mes polices importées ?",
                  a: "Vos polices sont accessibles dans tous vos projets (cadres). Si vous partagez l'accès à un cadre avec un collaborateur, celui-ci pourra également utiliser les polices que vous avez importées sur ce cadre.",
                },
                {
                  q: "Puis-je utiliser les polices Adobe Fonts / Canva ?",
                  a: "Cela dépend de votre licence. Adobe Fonts autorise généralement l'utilisation dans des projets finaux. Canva Pro permet l'usage des polices dans les designs créés sur Canva. Vérifiez les conditions spécifiques de votre abonnement.",
                },
                {
                  q: "Puis-je supprimer une police importée ?",
                  a: "Oui, depuis l'onglet \"Mes polices\". La suppression est immédiate. Les cadres utilisant cette police afficheront une police de remplacement.",
                },
              ].map((item, i) => (
                <details key={i} className="group">
                  <summary className="flex items-center justify-between cursor-pointer py-2 text-sm font-medium text-gray-700 hover:text-[#4f46e5] transition-colors list-none">
                    {item.q}
                    <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <p className="text-[11px] text-gray-500 leading-relaxed pb-2 pl-0">{item.a}</p>
                </details>
              ))}

              {/* Contact */}
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-gray-400">
                  Une question sur les licences ? Contactez-nous à <b>support@selfizee.com</b>
                </p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(PanelTextes);
