# Transcendence

## Description
`Transcendence` is a full-stack web application project at **42**.  
The goal is to build an **online multiplayer Pong game** with authentication, real-time communication, and a leaderboard.  
This project introduces concepts like **WebSockets**, **JWT authentication**, **2FA (Google Authenticator)**, and **3D graphics**.

## Features
- **Multiplayer Pong** playable in real-time through the browser  
- Player **authentication**:
  - JWT-based sessions  
  - Optional 2FA using Google Authenticator  
- **Game lobby system** with tournament and public rooms  
- **Dashboaard** tracking player main stats  
- **WebSocket server** managing real-time game state  
- **3D graphics** for the game using Babylon.js  
- Frontend built as a **SPA** with TypeScript and Tailwind CSS

## Tech Stack
- **Frontend:** TypeScript, Tailwind CSS, Babylon.js  
- **Backend:** Node.js, Fastify, WebSocket  
- **Database:** SQLite  
- **Authentication:** JWT, 2FA (Google Authenticator)  

## Usage
Clone the repository and install dependencies:

```bash
git clone https://github.com/G-robledo/transcendence.git
cd transcendence
npm install
