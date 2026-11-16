# ft_transcendence

A browser-based Pong platform developed as part of the École 42 curriculum. The project combines a TypeScript front end, a Fastify back end and WebSocket game sessions, with player accounts and match statistics stored in SQLite.

## Features

- 2D and 3D game views, including a Babylon.js renderer.
- Local two-player games, online matchmaking and a bot opponent.
- Four-player online tournaments with a bracket and final.
- Registration, password authentication, JWT sessions and optional two-factor authentication with TOTP.
- Player profiles, avatar uploads, match history and statistics.

## Stack and architecture

| Area | Technologies |
| --- | --- |
| Front end | TypeScript, Tailwind CSS, Babylon.js |
| Back end | Node.js, Fastify, WebSocket |
| Data and authentication | SQLite, bcrypt, JWT, Speakeasy TOTP |
| Build and local runtime | TypeScript compiler, Docker, Make, HTTPS |

The browser loads views and controllers through the [front-end router](frontend/router.ts). The back end serves the application over HTTPS and coordinates matchmaking, game rooms and tournaments.

- [`frontend/`](frontend/): routing, page controllers and 2D/3D game clients.
- [`backend/`](backend/): HTTP API, authentication, game loop, WebSocket sessions and tournaments.
- [`shared/type.ts`](shared/type.ts): shared game-state types.
- [`public/`](public/): HTML views and static assets.
- [`backend/database.ts`](backend/database.ts): SQLite schema and initialization.

## Run locally with Docker

Prerequisites: Git, Make, a running Docker daemon, OpenSSL with support for `-addext`, and an available local port `8443`.

```sh
git clone https://github.com/G-robledo/Transcendence.git
cd Transcendence
```

Generate a local JWT secret and a development certificate. These commands replace the checkout's `.env`, `certs/server.key` and `certs/server.crt`; use them for a fresh local demo.

```sh
printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -keyout certs/server.key -out certs/server.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

make all
```

Open **https://localhost:8443**, accept the warning for the locally generated self-signed certificate, and create an account. From the home screen, choose a local game, matchmaking, a bot or a tournament. Use a second account in a separate browser session to try online multiplayer.

The default Make target builds the image only: use `make all` to build **and** start the container. The container is named `transcendence`.

| Command | Action |
| --- | --- |
| `make build` | Build the Docker image |
| `make run` | Create and start a container from that image |
| `make logs` | Follow container logs |
| `make stop` | Stop the container |
| `make clean` | Stop and remove the container |
| `make rebuild` | Remove the container, rebuild and start a fresh one |

## Compile the TypeScript sources

For compilation outside Docker, install Node.js and npm, then run:

```sh
npm ci
make compile
```

This compiles the front end into `public/` and the back end into `dist/`. It does not start the server or build Tailwind CSS; the Dockerfile handles the complete build. Server paths currently assume the Docker layout, including `/app/data/database.sqlite`.

## Data and current limitations

- The default Docker command stores SQLite data inside the container. Removing or rebuilding the container discards that data.
- SQLite initialization currently creates `match_history` without `IF NOT EXISTS`. Reusing an existing database can fail with `table match_history already exists`; initialization needs updating before relying on persistent storage or repeated starts of the same container.
- `npm test` is a placeholder, not an automated test suite.
