/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gameLoop.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/11 13:07:25 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/09 21:59:17 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { rooms } from './wsHandler.js';
import { broadcast, getUsernameFromSide } from './gameUtils.js';
import { OutputMessage, PlayerId, PlayerInput } from '../shared/type.js';
import { saveMatchResult } from './gameUtils.js';
import type { Match } from './tournament.js';
import { tournamentSockets, bracket, finalMatch, handleFinalsUpdate } from './tournament.js';

const TICK_RATE = 60;
const FRAME_TIME = 1 / TICK_RATE;

const SIDES: PlayerId[] = [ 'left', 'right' ];
const INPUT_KEYS: (keyof PlayerInput)[] = [ 'up', 'down' ];

export function startGameLoop()
{
	setInterval(() => {
		for (const roomId in rooms) {
			const room = rooms[roomId]; // give le bon romm id 

			if (!room.gameStarted) {
				continue;
			}

			const score = room.game.state.score;

			let lastScorer: PlayerId | null = null;

			if (room.lastScore) {
				if (score.left !== room.lastScore.left || score.right !== room.lastScore.right) {
					if (score.left > room.lastScore.left) {
						lastScorer = 'left';
					}
					if (score.right > room.lastScore.right) {
						lastScorer = 'right';
					}
				}
			}

			let winner: PlayerId | null = null;

			if (score.left >= 5) {
				winner = 'left';
			}

			if (score.right >= 5) {
				winner = 'right';
			}

			if (winner !== null) {
				const winnerUsername = getUsernameFromSide(room, winner);

				broadcast(room, { type: "end", winner: winnerUsername });
				room.gameStarted = false;
				room.isPaused = false;

				// update le bracket pour le tournois
				if (roomId.startsWith("tourn-") && room.matchId && winnerUsername) {
					console.log(`[BACK][GAMELOOP] Declare winner! Room: ${roomId}, MatchId: ${room.matchId}, Winner: ${winnerUsername}`);

					let match: Match | null = null;

					if (bracket) {
						for (let i = 0; i < bracket.length; i++) {
							if (bracket[i].id === room.matchId) {
								match = bracket[i];
							}
						}
					}

					if (!match && finalMatch && finalMatch.id === room.matchId) {
						match = finalMatch;
					}

					let realWinner = winnerUsername;

					if (winnerUsername === "bot" && match) {
						if (match.p1.isBot) {
							realWinner = match.p1.name;
						}
						else {
							if (match.p2.isBot) {
								realWinner = match.p2.name;
							}
						}
					}

					if (match) {
						match.status = "done";
						match.winner = realWinner;
						handleFinalsUpdate(match);
					}

					for (const ws of tournamentSockets) {
						if (ws.readyState === 1) {
							ws.send(JSON.stringify({
								action: "declare_winner",
								matchId: room.matchId,
								winner: realWinner
							}));
						}
					}
				}

				if (room.botSide) {
					const botUsername = "bot";
					let humanSide: PlayerId;

					if (room.botSide === 'left') {
						humanSide = 'right';
					}
					else {
						humanSide = 'left';
					}

					const humanUsername = getUsernameFromSide(room, humanSide);

					let scoreBot: number = 0;
					let scoreHuman: number = 0;

					if (room.botSide === 'left') {
						scoreBot = score.left;
						scoreHuman = score.right;
					}
					else {
						scoreBot = score.right;
						scoreHuman = score.left;
					}

					const player1 = botUsername;
					const player2 = humanUsername;

					if (player1 && player2 && winnerUsername) {
						saveMatchResult(player1, player2, scoreBot, scoreHuman, winnerUsername);
					}
					else {
						console.error("Certains paramètres sont undefined ! (BOT)");
					}
				}
				else {
					let playerLeft: string | undefined = undefined;
					let playerRight: string | undefined = undefined;

					for (const c of room.clients) {
						if (c.id === 'left') {
							playerLeft = c.username;
						}
						if (c.id === 'right') {
							playerRight = c.username;
						}
					}

					const player1 = playerLeft;
					const player2 = playerRight;
					const score1 = score.left;
					const score2 = score.right;

					if (player1 && player2 && winnerUsername) {
						saveMatchResult(player1, player2, score1, score2, winnerUsername);
					}
					else {
						console.error("Certains paramètres sont undefined !");
					}
				}
				continue;
			}

			if (lastScorer !== null) {
				room.isPaused = true;
				room.lastScorer = lastScorer;
				const scorerUsername = getUsernameFromSide(room, lastScorer);

				broadcast(room, { type: "pause", scorer: scorerUsername });

				if (room.inputs) {
					for (let i = 0; i < SIDES.length; ++i) {
						const side = SIDES[i];
						for (let j = 0; j < INPUT_KEYS.length; ++j) {
							const key = INPUT_KEYS[j];
							room.inputs[side][key] = false;
						}
					}
				}

				if (room.pauseTimer) {
					clearTimeout(room.pauseTimer);
				}

				room.pauseTimer = setTimeout(() => {
					room.isPaused = false;
					room.pauseTimer = undefined;
					broadcast(room, { type: "resume" });
				}, 2000);
			}

			room.lastScore = { left: score.left, right: score.right };

			if (room.isPaused) {
				continue;
			}

			room.game.update(FRAME_TIME, room.inputs);

			const output: OutputMessage = { state: room.game.state };
			const payload = JSON.stringify(output);

			for (const c of room.clients) {
				if (c.socket && c.socket.readyState === 1) {
					c.socket.send(payload);
				}
			}
		}
	}, FRAME_TIME);
}
