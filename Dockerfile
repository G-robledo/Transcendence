# etape 1 : Build
FROM node:20-slim AS builder

WORKDIR /app

# Copier les fichiers de config et installer les dependances
COPY package*.json ./
COPY tailwind.config.js ./
RUN npm install

# Copier le reste des sources
COPY tsconfig.front.json tsconfig.back.json ./
COPY frontend/ ./frontend
COPY backend/ ./backend
COPY shared/ ./shared
COPY public/index.html ./public/index.html
COPY public/favicon.ico ./public/favicon.ico
COPY public/pages ./public/pages
COPY public/avatars ./public/avatars
COPY frontend/tailwind.css ./frontend/tailwind.css

# Compiler Tailwind CSS
RUN npx tailwindcss -i ./frontend/tailwind.css -o ./public/tailwind.css --minify

# Compiler le front → public/
RUN npx tsc --project tsconfig.front.json

# Compiler le back → dist/
RUN npx tsc --project tsconfig.back.json

# -------------------------------------------------------------
# etape 2 : Image finale
FROM node:20-slim

WORKDIR /app

RUN mkdir -p /app/data
#install sqlite to prevent npm freeze
RUN apt update && apt install -y sqlite3

# Copier le build et les dépendances depuis l'étape builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/public/avatars ./public/avatars
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Certificats SSL
COPY /certs/server.crt /app/cert/server.crt
COPY /certs/server.key /app/cert/server.key
COPY .env /app

EXPOSE 8443

CMD ["node", "dist/backend/server.js"]
