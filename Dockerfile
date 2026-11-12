FROM node:22.23.4-alpine AS builder

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
# Droits Konitys : gateway (SDK des droits, page « Accès refusé ») ; vide = tout autorisé côté écran (l'API contrôle toujours)
ARG NEXT_PUBLIC_GATEWAY_URL=
# Remontée des erreurs vers ticket-flow (SDK @devselfizee/ticket-flow-reporter, comme selfizee-booth-ui) : URL vue par le
# navigateur (/ticket-flow-proxy), clé du projet et jeton ; TICKET_FLOW_API_URL : l'API ticket-flow derrière le proxy
ARG NEXT_PUBLIC_TICKET_FLOW_URL=
ARG NEXT_PUBLIC_TICKET_FLOW_PROJECT=
ARG NEXT_PUBLIC_TICKET_FLOW_TOKEN=
ARG TICKET_FLOW_API_URL=
ENV NEXT_PUBLIC_TICKET_FLOW_URL=$NEXT_PUBLIC_TICKET_FLOW_URL
ENV NEXT_PUBLIC_TICKET_FLOW_PROJECT=$NEXT_PUBLIC_TICKET_FLOW_PROJECT
ENV NEXT_PUBLIC_TICKET_FLOW_TOKEN=$NEXT_PUBLIC_TICKET_FLOW_TOKEN
ENV TICKET_FLOW_API_URL=$TICKET_FLOW_API_URL
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_BIBLIOTHEQUES_URL=$NEXT_PUBLIC_BIBLIOTHEQUES_URL
ENV NEXT_PUBLIC_STUDIO_BACKEND_URL=$NEXT_PUBLIC_STUDIO_BACKEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL
ENV NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ENV NEXT_PUBLIC_PLATEFORM_URL=$NEXT_PUBLIC_PLATEFORM_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_TELEMETRY_DISABLED=1

# Le SDK ticket-flow vient de GitHub Packages : NPM_TOKEN (build arg) pour l'installer, lu par .npmrc. Seulement à
# l'installation : il ne passe pas dans l'image finale
ARG NPM_TOKEN
COPY package*.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Production image ──────────────────────────────────────

FROM node:22.23.4-alpine

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
