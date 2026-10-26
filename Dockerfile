FROM node:22-alpine AS builder

WORKDIR /app

# Intégrées au code client au moment du build (variables NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM=konitys
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=regie-selfizee
# En-tête et barre latérale de la plateforme Konitys (Module Federation)
ARG NEXT_PUBLIC_PLATEFORM_URL=https://plateform.orkessi.com
# Autocomplétion d'adresse (Google Places), facultative
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
# Studio de cadres, facultatives (les autres variables du studio se lisent à l'exécution, cf. .env.example)
ARG NEXT_PUBLIC_BIBLIOTHEQUES_URL=
ARG NEXT_PUBLIC_STUDIO_BACKEND_URL=
ENV NEXT_PUBLIC_BIBLIOTHEQUES_URL=$NEXT_PUBLIC_BIBLIOTHEQUES_URL
ENV NEXT_PUBLIC_STUDIO_BACKEND_URL=$NEXT_PUBLIC_STUDIO_BACKEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL
ENV NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ENV NEXT_PUBLIC_PLATEFORM_URL=$NEXT_PUBLIC_PLATEFORM_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Production image ──────────────────────────────────────

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000

CMD ["node", "server.js"]
