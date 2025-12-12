/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tournamentUtils.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/07 17:46:45 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 00:02:43 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Match, slots, Slot } from "./tournament";
import { dbPromise } from './database';
import jwt from 'jsonwebtoken';

 // add win to db
export async function importWinnerIndb(match: Match) {
	const db = await dbPromise;
	const winner = match.winner;
	if (winner && slots.find(s => s.name === winner && !s.isBot)) {
		await db.run(
			'UPDATE players SET tournaments_won = COALESCE(tournaments_won,0) + 1 WHERE username = ?',
			winner
		);
	}
}

// if winner = bot just get name
export function pruneSlot(slot: { name: string; isBot: boolean }): { name: string; isBot: boolean } {
	return { name: slot.name, isBot: slot.isBot };
} 

export function pruneMatch(match: Match): any {
	return {
		id: match.id,
		p1: pruneSlot(match.p1),
		p2: pruneSlot(match.p2),
		status: match.status,
		winner: match.winner,
		mode: match.mode,
		roomId: match.roomId,
		playerModes: match.playerModes
	};
} 

// broadcast bracket to any person on tournament page
export function broadcastBracket(slots: Slot[], bracket: Match[] | null, finalMatch: Match | null, tournamentSockets: any[]) {
	const safeSlots = slots.map(pruneSlot);
	const safeBracket = bracket ? bracket.map(pruneMatch) : [];
	let safeFinal = null;
	if (finalMatch) {
		safeFinal = pruneMatch(finalMatch);
	}
	for (const ws of tournamentSockets) {
		if (ws && ws.readyState === 1) {
			const slot = slots.find(s => s.ws === ws && !s.isBot);
			const name = slot ? slot.name : null;
			ws.send(JSON.stringify({
				type: "bracket",
				slots: safeSlots,
				matches: safeBracket,
				final: safeFinal,
				you: name
			}));
		}
	}
}

// slot gestion and remove everything useless
export function broadcastSlots(slots: Slot[], tournamentSockets: any[]) {
	const safeSlots = slots.map(pruneSlot);
	for (const ws of tournamentSockets) {
		if (ws && ws.readyState === 1) {
			ws.send(JSON.stringify({ type: "slots", slots: safeSlots }));
		}
	}
}

//shuffle function
export function shuffle<T>(arr: T[]): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = a[i];
		a[i] = a[j];
		a[j] = tmp;
	}
	return a;
}

// get username in JWT
export function getUsernameFromToken(token?: string): string | null {
	try {
		if (!token) 
			return null;
		const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "42") as any;
		if (decoded && decoded.username) 
			return decoded.username;
		return null;
	} 
	catch { return null; }
}

// choose randomly winner in bot vs bot
export function autoResolveBotMatch(match: Match, broadcastBracketFn: () => void, handleFinalsUpdateFn: (match: Match) => void) {
	if (match.p1.isBot && match.p2.isBot) {
		const winner = Math.random() < 0.5 ? match.p1.name : match.p2.name;
		setTimeout(() => {
			match.status = "done";
			match.winner = winner;
			broadcastBracketFn();
			handleFinalsUpdateFn(match);
		}, 1000);
	}
}
