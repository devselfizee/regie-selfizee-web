"use client";

// Page « Accès refusé » — thème partagé servi par le gateway (docs/PERMISSIONS_APP_INTEGRATION.md, 3.5 et 5.3).
// N'affiche jamais la clé du droit manquant.

import { useEffect, useState, type ReactNode } from "react";
import { APP_KEY, GATEWAY_URL } from "@/lib/perms";

const PLATEFORM = (process.env.NEXT_PUBLIC_PLATEFORM_URL ?? "").replace(/\/$/, "");

const ICONS: Record<string, ReactNode> = {
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </>
  ),
  alert: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  xcircle: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),
};
const SHADOWS: Record<string, string> = {
  none: "none",
  light: "0 4px 12px rgba(15,23,42,0.04)",
  medium: "0 20px 50px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
  heavy: "0 30px 80px rgba(15,23,42,0.15), 0 8px 20px rgba(15,23,42,0.08)",
};
const DEFAULT_THEME = {
  page: { bg_from: "#eef4fb", bg_to: "#e0e7ff", padding: 24 },
  card: { bg: "#ffffff", radius: 20, shadow: "medium", padding_y: 40, padding_x: 40 },
  icon: { preset: "lock", size: 88, bg_from: "#fef2f2", bg_to: "#fee2e2", color: "#dc2626", radius: 50, dashed_border: true },
  title: { text: "Accès non autorisé", color: "#0f172a", size: 22, weight: 700, letter_spacing: -0.01 },
  message: {
    text: "Votre compte ne dispose pas des droits nécessaires pour accéder à cette ressource. Contactez votre administrateur pour obtenir les autorisations requises.",
    color: "#64748b",
    size: 14,
  },
  button: { bg: "#6366f1", bg_hover: "#4f46e5", color: "#ffffff", radius: 10, shadow: true },
};
type Theme = typeof DEFAULT_THEME;

function resolveRedirect(): { url: string | null; label: string | null } {
  const sdk = window.__KONITYS_PERMS;
  if (!sdk || sdk.has(`${APP_KEY}:app.access`)) return { url: "/", label: "Retour à l'accueil" };
  if (PLATEFORM && sdk.has("hub:app.access")) return { url: PLATEFORM, label: "Retour au Hub" };
  return { url: null, label: null };
}

export default function AccessDenied() {
  const [t, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [redirect, setRedirect] = useState<{ url: string | null; label: string | null }>({ url: "/", label: "Retour à l'accueil" });

  useEffect(() => {
    if (!GATEWAY_URL) return;
    fetch(`${GATEWAY_URL}/config/deny-theme.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { config?: Partial<Theme> } | null) => {
        // Thème incomplet : valeurs par défaut champ par champ
        if (d?.config) setTheme(Object.fromEntries(Object.entries(DEFAULT_THEME).map(([k, v]) => [k, { ...v, ...(d.config as Record<string, object>)[k] }])) as Theme);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // le SDK peut finir de charger après l'affichage de la page
    const tryResolve = () => {
      if (window.__KONITYS_PERMS) setRedirect(resolveRedirect());
    };
    tryResolve();
    const iv = setInterval(tryResolve, 150);
    const to = setTimeout(() => clearInterval(iv), 4000);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, []);

  const size = Math.round(t.icon.size * 0.45);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: t.page.padding,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: `linear-gradient(135deg, ${t.page.bg_from} 0%, ${t.page.bg_to} 100%)`,
      }}
    >
      <div
        style={{
          background: t.card.bg,
          borderRadius: t.card.radius,
          boxShadow: SHADOWS[t.card.shadow] || SHADOWS.medium,
          padding: `${t.card.padding_y}px ${t.card.padding_x}px`,
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ position: "relative", display: "inline-flex", margin: "0 auto 24px" }}>
          <div
            style={{
              width: t.icon.size,
              height: t.icon.size,
              borderRadius: `${t.icon.radius}%`,
              color: t.icon.color,
              background: `linear-gradient(135deg, ${t.icon.bg_from} 0%, ${t.icon.bg_to} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[t.icon.preset] || ICONS.lock}
            </svg>
          </div>
          {t.icon.dashed_border && (
            <span
              style={{ position: "absolute", inset: -6, borderRadius: `${t.icon.radius}%`, border: `2px dashed ${t.icon.color}55`, opacity: 0.6, pointerEvents: "none" }}
            />
          )}
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: t.title.size, fontWeight: t.title.weight, color: t.title.color, letterSpacing: `${t.title.letter_spacing}em` }}>
          {t.title.text}
        </h1>
        <p style={{ margin: "0 0 28px", color: t.message.color, fontSize: t.message.size, lineHeight: 1.6 }}>{t.message.text}</p>
        {redirect.url && (
          <a
            href={redirect.url}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 22px",
              background: t.button.bg,
              color: t.button.color,
              textDecoration: "none",
              borderRadius: t.button.radius,
              fontWeight: 600,
              fontSize: 14,
              boxShadow: t.button.shadow ? `0 4px 12px ${t.button.bg}44` : "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            {redirect.label}
          </a>
        )}
      </div>
    </div>
  );
}
