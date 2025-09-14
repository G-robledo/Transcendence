/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tournament.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 17:39:13 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:53 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fastifyWebsocket from '@fastify/websocket';
import { rooms, config } from './wsHandler.js';
import { startBot } from './ia-pong.js';
import { Game } from './game.js';
import type { PlayerId } from '../shared/type.js';
import { dbPromise } from './database';
import { importWinnerIndb, broadcastBracket, broadcastSlots, shuffle, getUsernameFromToken, autoResolveBotMatch } from './tournamentUtils.js';

export type Slot = { name: string; ws: WebSocket | null; isBot: boolean };
type PlayerMode = "2d" | "3d" | null;

export type Match = {
	id: string;
	p1: Slot;
	p2: Slot;
	status: "waiting" | "playing" | "done";
	winner: string | null;
	mode: PlayerMode;
	roomId: string | null;
	playerModes: { [name: string]: PlayerMode };
};

export let slots: Slot[] = [];
export let bracket: Match[] | null = null;
export let finalMatch: Match | null = null;
let tournamentStarted: boolean = false;
export let tournamentSockets: WebSocket[] = [];

export async function handleFinalsUpdate(match: Match) { // gere les brackets pour recuperer les user qui vont en finale et cree le bracket final
	console.log('[TOURNOI] Appel handleFinalsUpdate pour match.id =', match.id, 'bracket = ', bracket, 'finalmatch =', finalMatch, 'maatchid = ', match.id);

	if (bracket && finalMatch && (match.id === "m1" || match.id === "m2")) {
		if (match.id === "m1") {
			if (match.winner === match.p1.name) {
				finalMatch.p1 = { ...match.p1 };
				finalMatch.playerModes[match.winner] = match.playerModes[match.p1.name];
				reassignPlayerWsEverywhere(match.winner, match.p1.ws);
			}
			else {
				if (match.winner === match.p2.name) {
					finalMatch.p1 = { ...match.p2 };
					finalMatch.playerModes[match.winner] = match.playerModes[match.p2.name];
					reassignPlayerWsEverywhere(match.winner, match.p1.ws);
				}
				else {
					finalMatch.p1 = { name: "…", ws: null, isBot: false }; // si on arrive pas a avoir le pseudo empeche le tournois de crash
				}
			}
		}
		if (match.id === "m2") {
			if (match.winner === match.p1.name) {
				finalMatch.p2 = { ...match.p1 };
				finalMatch.playerModes[match.winner] = match.playerModes[match.p1.name];
				reassignPlayerWsEverywhere(match.winner, match.p1.ws);
			}
			else {
				if (match.winner === match.p2.name) {
					finalMatch.p2 = { ...match.p2 };
					finalMatch.playerModes[match.winner] = match.playerModes[match.p2.name];
					reassignPlayerWsEverywhere(match.winner, match.p1.ws);
				}
				else {
					finalMatch.p2 = { name: "…", ws: null, isBot: false };
				}
			}
		}

		broadcastBracket(slots, bracket, finalMatch, tournamentSockets);

		let bothDone: boolean = true; // si les deux matchs sont fini on a les noms des deux gagnants on peut passer a la finale
		for (let i = 0; i < bracket.length; i++) {
			if (bracket[i].status !== "done") {
				bothDone = false;
			} // check si les deux matchs sont finit
		}

		if (bothDone) {
			finalMatch.status = "waiting";
			finalMatch.winner = null;
			finalMatch.mode = null;
			finalMatch.roomId = null;
			broadcastBracket(slots, bracket, finalMatch, tournamentSockets);

			if (finalMatch.p1.isBot && finalMatch.p2.isBot) {
				autoResolveBotMatch(finalMatch, () => broadcastBracket(slots, bracket, finalMatch, tournamentSockets), handleFinalsUpdate);
			}
		}
	}
	if (finalMatch && match.id === "final" && match.status === "done") {
		setTimeout(() => {
			importWinnerIndb(match);
			for (let i = 0; i < slots.length; i++) {
				const ws = slots[i].ws;
				if (ws && typeof ws.close === 'function') {
					ws.close();
				}
			}
			slots = [];
			bracket = null;
			finalMatch = null;
			tournamentStarted = false;
		}, 5000);
	} // si le match est fini on affiche le pseudo pendant 5 seconde et on quitte
}

export async function tournamentWebSocket(app: FastifyInstance) { app.get('/ws/tournament', { websocket: true }, async (ws: WebSocket, req) => {
		const token = (req.query as any).token;
		let name: string | null = getUsernameFromToken(token);
		if (!name) {
			const randNum: number = Math.floor(1 + Math.random() * 9000);
			name = "Player" + randNum;
		} // pas sense arriver mais permet de corriger les erreurs de typage puisque name jamais null

		let slot = slots.find(s => s.name === name && !s.isBot); // on verifie si il y a des joueurs dans les slots, si oui on  associe la socket
		if (slot) {
			slot.ws = ws;
			reassignPlayerWsEverywhere(name, ws);
		}

		if (bracket) {
			for (const match of bracket) {
				if (match.p1.name === name && !match.p1.isBot) {
					match.p1.ws = ws;
				}
				if (match.p2.name === name && !match.p2.isBot) { // si le joueur est dans le match et pas un bot on update la reference de socket pour rester synchro
					match.p2.ws = ws;
				}
			}
		}
		if (finalMatch) {
			if (finalMatch.p1.name === name && !finalMatch.p1.isBot) {
				finalMatch.p1.ws = ws;
			}
			if (finalMatch.p2.name === name && !finalMatch.p2.isBot) { // pareil pour finale
				finalMatch.p2.ws = ws;
			}
		}

		broadcastSlots(slots, tournamentSockets); // on broadcast tous aux joueurs
		if (bracket) {
			broadcastBracket(slots, bracket, finalMatch, tournamentSockets);
		}

		ws.on('message', async (raw) => {
			let msg: any;
			try {
				msg = JSON.parse(raw.toString());
			}
			catch {
				msg = undefined;
			}
			if (!msg) {
				return;
			}

			if (msg.action === "join") {
				if (tournamentStarted) {
					ws.send(JSON.stringify({ type: "error", message: "Tournoi dejà lance !" }));
				}
				else if (slots.length >= 4){
					ws.send(JSON.stringify({ type: "error", message: "deja 4 personne dans le tournois" }));
				}

				else {
					const already = slots.find(s => s.name === name);
					if (!already) {
						slots.push({ name, ws, isBot: false });
						broadcastSlots(slots, tournamentSockets);
					}
				}
			} // si quelqu'un essaie de rejoindre le match, si il est pas deja dans la liste de joueur et que le tournois est pas encore lance on l'ajoute

			if (msg.action === "quit") {
				if (tournamentStarted) {
					ws.send(JSON.stringify({ type: "error", message: "Impossible de quitter : tournoi dejà lance !" }));
				}
				else {
					const idx = slots.findIndex(s => s.name === name && !s.isBot);
					if (idx !== -1) {
						slots.splice(idx, 1);
						broadcastSlots(slots, tournamentSockets);
					}
				}
			} // si tournois pas lance on enleve le nom du joueur de la liste des joueurs sinon il se passe rien

			console.log(`[WS-REASSOC] ${name} ws reassocie partout.`);
			if (msg.action === "add_bot") {
				if (!tournamentStarted) {
					if (slots.length < 4) {
						let idx: number = 1;
						let botName: string = "Bot" + idx;
						while (slots.find(s => s.name === botName)) {
							idx++;
							botName = "Bot" + idx;
						}
						slots.push({ name: botName, ws: null, isBot: true });
						broadcastSlots(slots, tournamentSockets);
					}
				}
			} // ajout de bot si - de 4 joueurs

			if (msg.action === "remove_bot") {
				if (!tournamentStarted) {
					let reversed: Slot[] = Array.from(slots).reverse();
					let bot: Slot | null = null;
					for (let i = 0; i < reversed.length; i++) {
						if (reversed[i].isBot) {
							bot = reversed[i];
							break;
						}
					}
					if (bot) {
						slots = slots.filter(s => s !== bot);
						broadcastSlots(slots, tournamentSockets);
					}
				}
			} // pareil pour enlever les bots

			if (msg.action === "launch") {
				const launcherSlot = slots.find(s => s.name === name && !s.isBot);
				if (!launcherSlot) {
					ws.send(JSON.stringify({ type: "error", message: "Seul un joueur participant au tournois peut lancer !" }));
				}
				else {
					const nbHumans = slots.filter(s => !s.isBot).length;
					if (nbHumans === 0) {
						ws.send(JSON.stringify({ type: "error", message: "Impossible de lancer un tournoi uniquement compose de bots !" }));
					}
					else {
						if (!tournamentStarted) {
							if (slots.length === 4) {
								tournamentStarted = true;
								const shuffled = shuffle(slots);
								bracket = [
									{
										id: "m1",
										p1: shuffled[0],
										p2: shuffled[1],
										status: "waiting",
										winner: null,
										mode: null,
										roomId: null,
										playerModes: { }
									},
									{
										id: "m2",
										p1: shuffled[2],
										p2: shuffled[3],
										status: "waiting",
										winner: null,
										mode: null,
										roomId: null,
										playerModes: { }
									}
								];

								bracket[0].playerModes[shuffled[0].name] = shuffled[0].isBot ? "2d" : null;
								bracket[0].playerModes[shuffled[1].name] = shuffled[1].isBot ? "2d" : null;
								bracket[1].playerModes[shuffled[2].name] = shuffled[2].isBot ? "2d" : null;
								bracket[1].playerModes[shuffled[3].name] = shuffled[3].isBot ? "2d" : null;

								finalMatch = {
									id: "final",
									p1: { name: "…", ws: null, isBot: false },
									p2: { name: "…", ws: null, isBot: false },
									status: "waiting",
									winner: null,
									mode: null,
									roomId: null,
									playerModes: {}
								};
								broadcastBracket(slots, bracket, finalMatch, tournamentSockets); // creation des brackets avec le melange de joueur. si bot on lui donne un mode 2d par default (ca change rien pas de render pour bot)

								const db = await dbPromise;
								const humanUsernames = slots.filter(s => !s.isBot).map(s => s.name);
								if (humanUsernames.length > 0) {
									for (const username of humanUsernames) {
										await db.run(
											'UPDATE players SET tournaments_played = COALESCE(tournaments_played,0) + 1 WHERE username = ?',
											username
										);
									}
								} // on fais +1 a tous les vrais joueur en tournois joue pour tous ceux qui ont lance le tournois

								for (const match of bracket) {
									if (match.p1.isBot && match.p2.isBot) {
										autoResolveBotMatch(match, () => broadcastBracket(slots, bracket, finalMatch, tournamentSockets), handleFinalsUpdate); // si match vs bot on skip le match 
									}
								}
							}
						}
					}
				}
			}

			if (msg.action === "choose_mode" && msg.matchId && msg.mode) {
				let match: Match | null = null;
				if (bracket) {
					for (let i = 0; i < bracket.length; i++) {
						if (bracket[i].id === msg.matchId) {
							match = bracket[i];
						}
					}
				}
				if (!match && finalMatch && finalMatch.id === msg.matchId) {
					match = finalMatch;
				}
				if (match) {
					if (name in match.playerModes) {
						if (match.status === "waiting") {
							match.playerModes[name] = msg.mode;
							broadcastBracket(slots, bracket, finalMatch, tournamentSockets);
						}
					}
				}
			} // tant qu'on a pas choisi de mode on est en waiting des qu'on en choisit un on recupere la value

			if (msg.action === "start_match" && msg.matchId) {
				let match: Match | null = null;
				if (bracket) {
					for (let i = 0; i < bracket.length; i++) {
						if (bracket[i].id === msg.matchId) {
							match = bracket[i];
						}
					}
				}
				if (!match && finalMatch && finalMatch.id === msg.matchId) {
					match = finalMatch;
				}
				if (match) {

					if (match.status === "playing" && match.roomId) {
						const player = [match.p1, match.p2].find(p => p.name === name && !p.isBot);
						if (player && ws.readyState === 1) {
							ws.send(JSON.stringify({
								type: "goto_game",
								matchId: match.id,
								roomId: match.roomId,
								mode: match.playerModes[name]
							}));
						}
					} // econnection si la partie est deja lancee
					else {
						if (match.status === "waiting") {
							const participants = [match.p1, match.p2];
							let missingMode: boolean = false;
							for (let i = 0; i < participants.length; i++) {
								const p = participants[i];
								if (!p.isBot) {
									const mode = match.playerModes[p.name];
									if (!mode || (mode !== "2d" && mode !== "3d")) {
										missingMode = true;
									} // securite pour bien avoir un render 
								}
							}
							if (!missingMode) {
								match.status = "playing";
								match.roomId = "tourn-" + Math.random().toString(36).slice(2, 10); // creation du roomid

								const clients: { id: PlayerId; username: string; socket: WebSocket | null }[] = [];
								let botSide: PlayerId | undefined = undefined;

								if (match.p1.isBot) {
									botSide = 'left';
								}
								else {
									clients.push({ id: 'left', username: match.p1.name, socket: null });
								}
								if (match.p2.isBot) {
									botSide = 'right';
								}
								else {
									clients.push({ id: 'right', username: match.p2.name, socket: null });
								} // on definit les sides des joueurs que ca soit bot ou humains

								rooms[match.roomId] = {
									game: new Game(config),
									clients,
									inputs: {
										left: { up: false, down: false },
										right: { up: false, down: false }
									},
									gameStarted: true,
									lastScore: { left: 0, right: 0 },
									lastScorer: null,
									matchId: match.id,
									...(botSide ? { botSide } : {})
								}; // on cree une nouvelle config ... pour eviter d'avoir a retaper tout pour bot
								if (botSide) {
									startBot(match.roomId, rooms[match.roomId], botSide, config);
								} // si y a un bot on le start

								broadcastBracket(slots, bracket, finalMatch, tournamentSockets);

								if (match.p1.isBot && match.p2.isBot) {
									autoResolveBotMatch(match, () => broadcastBracket(slots, bracket, finalMatch, tournamentSockets), handleFinalsUpdate); // si bot cvontre bot en finale on resous automatiquement
								}
								else {
									for (const player of [match.p1, match.p2]) {
										if (!player.isBot) {
											const slot = slots.find(s => s.name === player.name);
											if (slot && slot.ws && slot.ws.readyState === 1) {
												slot.ws.send(JSON.stringify({
													type: "goto_game",
													matchId: match.id,
													roomId: match.roomId,
													mode: match.playerModes[player.name]
												}));
											}
										}
									}
								}
							}
						}
					}
				}
			}

			if (msg.action === "declare_winner" && msg.matchId && msg.winner) { // on a un winner dans un match
				let match: Match | null = null;
				if (bracket) {
					for (let i = 0; i < bracket.length; i++) {
						if (bracket[i].id === msg.matchId) {
							match = bracket[i];
						} // on cherche grace a l'id quel match a son gagnanr
					}
				}
				if (!match && finalMatch && finalMatch.id === msg.matchId) {
					match = finalMatch;
				} // si il est pas dans les bracket de demi on check pour la finale et si c'est bien ce match qui a son gagnant on assigne son id a match
				if (match) {
					let winnerName: string = msg.winner;
					if (winnerName === "bot") {
						if (match.p1.isBot) {
							winnerName = match.p1.name;
						}
						else {
							if (match.p2.isBot) {
								winnerName = match.p2.name;
							}
						}
					}

					msg.winner = winnerName;
					match.status = "done"; // match termine
					match.winner = winnerName; //on stocke le nom de celui qui a gagne le match

					broadcastBracket(slots, bracket, finalMatch, tournamentSockets);
					handleFinalsUpdate(match);
				}
			}
		});

		tournamentSockets.push(ws);

		broadcastSlots(slots, [ws]);
		broadcastBracket(slots, bracket, finalMatch, [ws]);

		ws.on('close', () => {
			tournamentSockets = tournamentSockets.filter(s => s !== ws); // quand une socket se ferme on l'enleve de la liste des socket pour plus envoyer de message
			const slot = slots.find(s => s.name === name);// on regarde si c'est une socket dans le tournois
			if (slot) {
				slot.ws = null;
			} // si on trouve on met socket a null : confirme que joueur deco
			if (!tournamentStarted) {
				slots = slots.filter(s => !s.isBot || (s.isBot && s.ws !== null));
			} // on supprime tous les bots qui vont pas faire le tournois 
			broadcastSlots(slots, tournamentSockets);
		});
	});
}

function reassignPlayerWsEverywhere(name: string, ws: WebSocket | null) { // fonction pour resynchroniser toutes les sockets histoire que tous le monde voit la meme chose
	if (bracket) {
		for (const match of bracket) {
			if (match.p1.name === name && !match.p1.isBot) {
				match.p1.ws = ws;
			}
			if (match.p2.name === name && !match.p2.isBot) {
				match.p2.ws = ws;
			}
		}
	}
	if (finalMatch) {
		if (finalMatch.p1.name === name && !finalMatch.p1.isBot) {
			finalMatch.p1.ws = ws;
		}
		if (finalMatch.p2.name === name && !finalMatch.p2.isBot) {
			finalMatch.p2.ws = ws;
		}
	}
}
