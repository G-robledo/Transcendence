/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wsHandler.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 19:35:19 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:57 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { Game } from './game.js';
import { GameConfig, InputMessage, PlayerId, PlayerInput } from '../shared/type.js';
import type WebSocket from 'ws';
import { startBot, stopBot } from './ia-pong.js';
import jwt from 'jsonwebtoken';
import fastifyWebsocket from "@fastify/websocket";

// TYPES ET CONFIG
export const config: GameConfig = {
	width: 1280,
	height: 640,
	ballRadius: Math.floor(640 * 0.01),
	racquetHeight: Math.floor(640 * 0.12),
	racquetWidth: Math.floor(1280 * 0.01),
	racquetSpeed: Math.floor(640 * 0.025),
	initialBallSpeed: Math.floor(1280 * 0.015),
	ballSpeedFactor: 1.1,
	ballSpeed: Math.floor(1280 * 0.005),
	maxBallSpeed: Math.floor(1280 * 0.1)
};

export type GameRoom = {
	game: Game;
	clients: { id: PlayerId; username: string; socket: WebSocket | null }[];
	inputs: Record<PlayerId, PlayerInput>;
	gameStarted: boolean;
	timer?: NodeJS.Timeout;
	isPaused?: boolean;
	pauseTimer?: NodeJS.Timeout;
	disconnectTimer?: NodeJS.Timeout;
	pauseUntil?: number;
	lastScore: { left: number, right: number },
	lastScorer: PlayerId | null;
	botSide?: PlayerId;
	matchId?: string;
	_ready?: Set<string>;
};

export const rooms: Record<string, GameRoom> = {};

type WaitingPlayer = { username: string; socket: WebSocket; token: string };
let waitingPlayers: WaitingPlayer[] = [];

export async function gameWebSocket(app: FastifyInstance) {
	app.get('/ws/matchmaking', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => { // gestion matchmaking
		console.log('[SOCKET][MATCHMAKING][OPEN] Nouvelle connexion WS matchmaking.');
		let username: string = '';
		const query = req.query as any;
		const token: string = query.token;
		let mode: string = 'pvp';

		if (query.mode)
			mode = query.mode; // si on a un mode rentre on l'attribue a mode sinon mode par default

		if (token) { // on va ouvrir deux socket sans changer de pages donc on verifie le token pendant les changement
			try {
				const payload = jwt.verify(token, process.env.JWT_SECRET!);
				if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'username')) {
					username = (payload as any).username;
				}
			} 
			catch (event) {
				console.error("JWT error:", event);
			}
		}
		if (!username)
			username = "Anonyme"; // empeche un blocage pour username null ne devrait jamais arriver

		// reconnexion a une room contre un bot 
		if (mode === 'bot') {
			let soloRoomId: string | null = null;
			let existingPlayerSide: PlayerId | null = null;
			for (const [id, room] of Object.entries(rooms)) {
				if (id.startsWith('solo-')) {
					const client = room.clients.find(c => c.username === username); // check pour faire matcher l'username avec celui d'une partie
					if (client) {
						soloRoomId = id;
						existingPlayerSide = client.id; // si ca matche reqattribue son idee de salle et
						client.socket = socket; // on lui reassigne la socket
						if (room.disconnectTimer) {
							clearTimeout(room.disconnectTimer);
							room.disconnectTimer = undefined;
							room.isPaused = false;
						}
						console.log(`[SOCKET][MATCHMAKING][RECO] ${username} s'est reconnecte à la room ${soloRoomId} (contre bot)`);
						break;
					}
				}
			}
			if (soloRoomId && existingPlayerSide) { // on redonne toute les infos de la room au client
				socket.send(JSON.stringify({
					type: "match_found",
					roomId: soloRoomId,
					side: existingPlayerSide,
					opponent: "bot",
					bot: true
				}));
				return;
			}

			let botSide: PlayerId = Math.random() < 0.5 ? 'left' : 'right';
			let newPlayerSide: PlayerId = botSide === 'left' ? 'right' : 'left'; // random pour pas que le bot soit toujours du meme cote
			const roomId: string = "solo-" + Math.random().toString(36).slice(2, 10); // generatioon de la room id on enleve les premiers caracteres pour se debarasser du 0. et avoir une chaine un peu plus courte

			rooms[roomId] = { // si pas de room on cree une nouvelle config
				game: new Game(config),
				clients: [{ id: newPlayerSide, username: username, socket: socket }],
				inputs: {
					left: { up: false, down: false },
					right: { up: false, down: false }
				},
				gameStarted: true,
				lastScore: { left: 0, right: 0 },
				lastScorer: null,
				botSide: botSide
			};

			startBot(roomId, rooms[roomId], botSide, config); // game vs bot donc on le demarre et on envoie tout au client

			console.log(`[SOCKET][MATCHMAKING][NOUVEAU] ${username} VS bot dans la room ${roomId}`);
			socket.send(JSON.stringify({
				type: "match_found",
				roomId: roomId,
				side: newPlayerSide,
				opponent: "bot",
				bot: true
			}));
			return;
		}

		// si on a une partie solo en cours mais qu'on veut passer a un matchmaking on supprime la room solo
		for (const [id, room] of Object.entries(rooms)) {
			if (id.startsWith('solo-')) {
				const clientIdx = room.clients.findIndex(c => c.username === username);
				if (clientIdx !== -1) {
					// Detruit la room solo SANS pitie (tu pourrais aussi save son score etc)
					if (room.botSide !== undefined) stopBot(id);
					delete rooms[id];
					console.log(`[SOCKET][MATCHMAKING][CLEAN] Room solo supprimee pour ${username} avant matchmaking`);
				}
			}
		}

		// on a plus que les parties pvp a gerer
		let alreadyInRoom: string | null = null;
		let playerSide: PlayerId | null = null;

		// meme principe que contre un bot, si deja dans une room on reassocie tout
		for (const [id, room] of Object.entries(rooms)) {
			for (const client of room.clients) {
				if (client.username === username) {
					alreadyInRoom = id;
					playerSide = client.id;
					if (client.socket && client.socket !== socket) { // si le client a une socket differente de la nouvelle connexion on la ferme correctement pour eviter les double connexions
						console.log(`[SOCKET][MATCHMAKING][CLOSE] Fermeture ancienne socket de ${username} sur la room ${id}`);
						try {
							client.socket.close();
						} catch (event) {}
					}
					client.socket = socket; // update la reference de la nouvelle socket
					if (room.disconnectTimer) { // gestion pause
						clearTimeout(room.disconnectTimer);
						room.disconnectTimer = undefined;
						room.isPaused = false;
					}
					console.log(`[SOCKET][MATCHMAKING][RECO] ${username} s'est reconnecte à la room ${alreadyInRoom}`);
					break;
				}
			}
			if (alreadyInRoom) break; // si le joueur a ete retrouve on break la boucle for
		}

		// on redonne tout les infos au client pour la reconnexion
		if (alreadyInRoom && playerSide) {
			let opponentName: string = rooms[alreadyInRoom].clients.find(c => c.id !== playerSide)?.username || "inconnu";
			let isBot: boolean = !!rooms[alreadyInRoom].botSide;
			socket.send(JSON.stringify({
				type: "match_found",
				roomId: alreadyInRoom,
				side: playerSide,
				opponent: opponentName,
				bot: isBot
			}));
			return;
		}

		// si personne en file d'attente on ajoute le joueur qui arrive dans le matchmaking
		if (waitingPlayers.length === 0) {
			waitingPlayers.push({ username: username, socket: socket, token: token });
			socket.send(JSON.stringify({ type: "waiting" }));
			console.log(`[SOCKET][MATCHMAKING][WAIT] ${username} entre en attente.`);
		}
		// si deja quelqu'un dans la file d'attente on leur associe une room
		else {
			const opponent = waitingPlayers.shift(); // on supprime de la file d'attente le joueur qui y etait
			let roomId: string = "room-" + Math.random().toString(36).slice(2, 10); // generation d'id de room

			// on cree une nouvelle config
			rooms[roomId] = {
				game: new Game(config),
				clients: [
					{ id: 'left', username: opponent!.username, socket: opponent!.socket },
					{ id: 'right', username: username, socket: socket }
				],
				inputs: {
					left: { up: false, down: false },
					right: { up: false, down: false }
				},
				gameStarted: true,
				lastScore: { left: 0, right: 0 },
				lastScorer: null
			};

			// on envoie tout aux clients
			console.log(`[SOCKET][MATCHMAKING][MATCH] Match trouve : ${opponent!.username} (left) VS ${username} (right) dans la room ${roomId}`);
			opponent!.socket.send(JSON.stringify({ type: "match_found", roomId: roomId, side: 'left', opponent: username }));
			socket.send(JSON.stringify({ type: "match_found", roomId: roomId, side: 'right', opponent: opponent!.username }));
		}

		// si on a une deconnexion on check les rooms pour trouver sa socket pour la mettre a null et avoir une deco propre
		socket.on('close', () => {
			console.log('[SOCKET][MATCHMAKING][CLOSE] Socket matchmaking fermee.');
			waitingPlayers = waitingPlayers.filter(player => player.socket !== socket); // si il etaitr dans la file d'attente on le supprime
			for (const room of Object.values(rooms)) {
				for (const client of room.clients) {
					if (client.socket === socket) {
						client.socket = null;
						console.log(`[SOCKET][MATCHMAKING][ROOM] Socket de ${client.username} marquee comme deconnectee`);
					}
				}
			}
		});
	});

	app.get<{ Params: { roomId: string } }>('/ws/:roomId', { websocket: true }, (socket: WebSocket, req: FastifyRequest<{ Params: { roomId: string } }>) => { // socket principale qui s'occupe du jeu
		const roomId: string = req.params.roomId;
		const token: string = (req.query as any).token;
		let username: string = '';

		console.log(`[SOCKET][ROOM][OPEN] Connexion à la room ${roomId}`);

		if (token) { // re check de socket parce qu'aucun refresh entre matchmaking et lancement de jeu
			try {
				const payload = jwt.verify(token, process.env.JWT_SECRET!);
				if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'username')) {
					username = (payload as any).username;
				}
			} catch (event) {
				console.error("JWT error:", event);
			}
		}
		if (!username)
			username = "Anonyme"; // bloque pas la salle si pas d'user ne doit toujours jamais arriver

		// check si la room existe bien cote serveur
		const room = rooms[roomId];
		if (!room) {
			socket.send(JSON.stringify({ type: "error", message: "Room introuvable" }));
			socket.close();
			console.log(`[SOCKET][ROOM][ERROR] Tentative de connexion sur room inconnue : ${roomId}`);
			return;
		}

		// on attribue les sides aux joueurs. si quelqu'un de connecte mais pas joueur on lui attribue spectator
		let side: PlayerId | 'spectator' = 'spectator';
		let clientFound: { id: PlayerId; username: string; socket: WebSocket | null } | undefined = undefined;
		for (let i = 0; i < room.clients.length; i++) {
			if (room.clients[i].username === username) {
				side = room.clients[i].id;
				clientFound = room.clients[i];
				break;
			}
		}

		// bloc pour le refresh, si joueur actif et pas bot on reassocie une socket
		if (side !== 'spectator' && clientFound !== undefined) {
			clientFound.socket = socket;
			console.log(`[SOCKET][ROOM][OPEN] ${username} connecte/reconnecte à la room ${roomId} (${side})`);
			const isBotGame: boolean = !!room.botSide;
			const realActivePlayers = room.clients.filter(c => (c.id === 'left' || c.id === 'right') && c.socket !== null);

			// check si tous les joueurs qui sont sense etre dans la room sont bien la
			// let shouldResume: boolean = false;
			// if (isBotGame) {
			// 	if (realActivePlayers.length === 1)
			// 		shouldResume = true;
			// }
			// else {
			// 	if (realActivePlayers.length === 2)
			// 		shouldResume = true;
			// }

			// // si on a tout le monde on enleve la pause
			// if (shouldResume && room.isPaused) {
			// 	room.isPaused = false;
			// 	room.pauseUntil = undefined;
			// 	if (room.disconnectTimer) {
			// 		clearTimeout(room.disconnectTimer);
			// 		room.disconnectTimer = undefined;
			// 	}
			// 	console.log(`[SOCKET][ROOM][RESUME] Jeu repris dans la room ${roomId}`);
			// 	for (const c of room.clients) {
			// 		if (c.socket && c.socket.readyState === 1) {
			// 			c.socket.send(JSON.stringify({ type: "resume" }));
			// 		}
			// 	}
			// }
		}
		socket.send(JSON.stringify({ type: 'init', player: side }));

		// si un des joueurs se reconnecte mais pas l'autre on lui notifie qu'il est toujours en pause pendant le temps qui reste
		if (room.isPaused && room.pauseUntil) {
			console.log(`[SOCKET][ROOM][PAUSE] ${username} reconnecte en pause: until=${room.pauseUntil}`);
			socket.send(JSON.stringify({ type: "pause", until: room.pauseUntil }));
		}

		// gestion  des messages envoyes par le client
		socket.on('message', (msg: WebSocket.RawData) => {
			try {
				if (side === 'spectator')
					return;
				let data;
				try {
					data = JSON.parse(msg.toString());
				} catch (e) {
					return; // Ignore invalid JSON
				}

				//message ready envoye pour sortir de la pause si tous le monde a envoye ready on sort de la pause ( pas de bug de pause )
				if (data && data.type === "ready") {
					if (!room._ready) room._ready = new Set();
					room._ready.add(username);

					const playerCount = room.clients.filter(c => c.id === 'left' || c.id === 'right').length;
					if (room._ready.size >= playerCount) {
						room.isPaused = false;
						room.pauseUntil = undefined;
						room._ready.clear();
						if (room.disconnectTimer) {
							clearTimeout(room.disconnectTimer);
							room.disconnectTimer = undefined;
						}
						console.log(`[SOCKET][ROOM][RESUME] Jeu repris dans la room ${roomId} (tous ready)`);
						for (const c of room.clients) {
							if (c.socket && c.socket.readyState === 1) {
								c.socket.send(JSON.stringify({ type: "resume" }));
							}
						}
					}
					return;
				}

				// Sinon message normal (inputs)
				const input: InputMessage = data;
				if (input.player === side && (side === 'left' || side === 'right')) {
					room.inputs[side] = input.input;
				}
			} catch (err) {
				console.error('Invalid input:', err);
			}
		});

		// pareil que pour matchmaking si deco on cherche la socket du joueur concerne on la met a null
		socket.on('close', () => {
			console.log(`[SOCKET][ROOM][CLOSE] Fermeture socket dans room ${roomId} (${username})`);
			const client = room.clients.find(c => c.socket === socket);
			if (client) {
				client.socket = null;
				console.log(`[SOCKET][ROOM][CLOSE] ${username} marque comme deconnecte dans la room ${roomId}`);
			}

			const activePlayers = room.clients.filter(c => (c.id === 'left' || c.id === 'right') && c.socket !== null);

			const isSoloVsBot: boolean = !!room.botSide;
			const shouldPause: boolean =(room.gameStarted && ((isSoloVsBot && activePlayers.length === 0) ||(!isSoloVsBot && activePlayers.length === 1)));

			// on pause 30 secondes en cas de deco pour permettre la reco
			if (shouldPause) {
				room.isPaused = true;
				const until: number = Date.now() + 30000;
				room.pauseUntil = until;
				console.log(`[SOCKET][ROOM][PAUSE] Pause declenchee dans la room ${roomId} (jusqu'à ${until})`);
				for (const client of room.clients) {
					if (client.socket && client.socket.readyState === 1) {
						client.socket.send(JSON.stringify({ type: "pause", until }));
					}
				}
				// si on arrive a la fin du timer on determine le gagnant et on clean la room
				if (room.disconnectTimer)
					clearTimeout(room.disconnectTimer);
				room.disconnectTimer = setTimeout(() => {
					let winner: string | null = null;
					const lastConnected = room.clients.find(c => (c.id === 'left' || c.id === 'right') && c.socket !== null);
					if (lastConnected)
						winner = lastConnected.username;
					else {
						if (room.botSide)
							winner = "bot";
					}
					if (winner) {
						console.log(`[SOCKET][ROOM][END] Fin du match dans room ${roomId}, winner=${winner}`);
					}
					room.gameStarted = false;
					room.isPaused = false;
					room.pauseUntil = undefined;

					const allGoneAfterTimeout: boolean = room.clients.filter(c => c.socket !== null).length === 0;
					if (allGoneAfterTimeout) {
						if (room.botSide !== undefined)
							stopBot(roomId);
						console.log(`[SOCKET][ROOM][DELETE] Suppression room ${roomId} (plus personne connecte)`);
						delete rooms[roomId];
					}
				}, 30000);
			}

			const hasRealPlayer: boolean = room.clients.some(c => (c.id === 'left' || c.id === 'right'));
			const allGone: boolean = room.clients.filter(c => c.socket !== null).length === 0;
			if (hasRealPlayer && allGone) {
				if (room.gameStarted) {
				}
				else {
					if (room.botSide !== undefined)
						stopBot(roomId);
					console.log(`[SOCKET][ROOM][DELETE-IMMEDIATE] Suppression immediate room ${roomId}`);
					delete rooms[roomId];
				}
			}
		});
	});
}
