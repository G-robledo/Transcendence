/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gameUtils.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 20:04:00 by grobledo          #+#    #+#             */
/*   Updated: 2025/12/11 20:00:44 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { GameRoom } from './wsHandler.js';
import { PlayerId } from '../shared/type.js';
import { dbPromise } from './database';

// send message to clients
export function broadcast(room: GameRoom, data: any) {
	const payload = JSON.stringify(data);
	for (let i = 0; i < room.clients.length; i++) {
		const c = room.clients[i];
		if (c.socket && c.socket.readyState === 1) {
			c.socket.send(payload);
		}
	}
}

export function getUsernameFromSide(room: GameRoom, side: PlayerId): string {
	for (let i = 0; i < room.clients.length; i++) {
		const client = room.clients[i];
		if (client.id === side && client.username)
			return client.username;
	}
	// if bot vs bot and we search bot side return bot
	if (room.botSide && side === room.botSide)
		return "bot";
	return side;
}


export async function saveMatchResult(player1: string,player2: string,score1: number,score2: number,winnerUsername: string) {
	const db = await dbPromise;

	// get player or bot ID
	let p1;
	if (player1 === 'bot')
		p1 = { id: 0 };
	else
		p1 = await db.get('SELECT id FROM players WHERE username = ?', player1);

	let p2;
	if (player2 === 'bot')
		p2 = { id: 0 };
	else
		p2 = await db.get('SELECT id FROM players WHERE username = ?', player2);

	if (!p1) {
		console.error('Player1 not found in database:', player1);
		return;
	}
	if (!p2) {
		console.error('Player2 not found in database:', player2);
		return;
	}

	let winner_id = null;
	if (winnerUsername === player1)
		winner_id = p1.id;
	else if (winnerUsername === player2)
		winner_id = p2.id;

	let player1_id = p1.id;
	let player2_id = p2.id;

	// Insert in match_history
	console.log('[DB] Enregistrement match :', {
		player1_id, player2_id, score1, score2, winner_id
	});

	const res = await db.run(
		`INSERT INTO match_history (player1_id, player2_id, score1, score2, winner_id)
		 VALUES (?, ?, ?, ?, ?)`,
		player1_id, player2_id, score1, score2, winner_id
	);

	console.log('[DB] Resultat INSERT :', res);

	// update player1 stat if not a bot
	if (player1_id !== 0) {
		const p1Stats = await db.get('SELECT game_played, game_won FROM players WHERE id = ?', player1_id);

		let p1Win = 0;
		if (winner_id === player1_id)
			p1Win = 1;

		let newP1Played = 0;
		if (p1Stats && p1Stats.game_played !== undefined)
			newP1Played = p1Stats.game_played + 1;
		else
			newP1Played = 1;

		let newP1Won = 0;
		if (p1Stats && p1Stats.game_won !== undefined)
			newP1Won = p1Stats.game_won + p1Win;
		else
			newP1Won = p1Win;

		let newP1Winrate = 0;
		if (newP1Played > 0)
			newP1Winrate = Math.round((newP1Won / newP1Played) * 100);

		await db.run(
			`UPDATE players SET game_played = ?, game_won = ?, winrate = ? WHERE id = ?`,
			newP1Played, newP1Won, newP1Winrate, player1_id
		);
	}

	// update player2 stat if not a bot
	if (player2_id !== 0) {
		const p2Stats = await db.get('SELECT game_played, game_won FROM players WHERE id = ?', player2_id);
		let p2Win = 0;
		if (winner_id === player2_id)
			p2Win = 1;

		let newP2Played = 0;
		if (p2Stats && p2Stats.game_played !== undefined)
			newP2Played = p2Stats.game_played + 1;
		else
			newP2Played = 1;

		let newP2Won = 0;
		if (p2Stats && p2Stats.game_won !== undefined)
			newP2Won = p2Stats.game_won + p2Win;
		else
			newP2Won = p2Win;

		let newP2Winrate = 0;
		if (newP2Played > 0)
			newP2Winrate = Math.round((newP2Won / newP2Played) * 100);

		await db.run(
			`UPDATE players SET game_played = ?, game_won = ?, winrate = ? WHERE id = ?`,
			newP2Played, newP2Won, newP2Winrate, player2_id
		);
	}
}
