/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ia-pong.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/12 12:46:37 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:41 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PlayerId, PlayerInput } from '../shared/type.js';
import type { GameRoom } from './wsHandler.js';
import type { Ball, GameConfig } from '../shared/type.js';


const IA_REFRESH_INTERVAL = 1000; // frequence prediction ia
const INPUT_INTERVAL = 1000 / 60;// frequence input

const predictionMap = new Map<string, number>(); // target du bot stocke pour chaque room
const goingToBotMap = new Map<string, boolean>(); // balle va vers joueur ou pas
const prevVyMap = new Map<string, number>(); // vitesse precedente de la balle
const predictionIntervals = new Map<string, NodeJS.Timeout>();
const inputIntervals = new Map<string, NodeJS.Timeout>();

function predictBallY(ball: Ball, config: GameConfig, side: PlayerId): number { // algo prediction
	let { posx: x, posy: y } = ball.position;
	let { posx: vx, posy: vy } = ball.velocity;
	let targetX = 0;

	if (side === 'right')
		targetX = config.width - config.racquetWidth;
	else
		targetX = config.racquetWidth; // quel side est le bot

	for (let steps = 0; steps < 1000; steps++) { // simulation traj ball sur 1000 step ou jusqu'au bord empeche loop infinie
		if ((side === 'right' && x >= targetX) || (side === 'left' && x <= targetX)) break;
		x += vx;
		y += vy;

		if (y <= 0 || y >= config.height) {
			vy *= -1;
			y = Math.max(0, Math.min(config.height, y)); // si balle touche un mur on inverse y
		}
	}
	return y;
}

export function startBot(roomId: string, room: GameRoom, side: PlayerId, config: GameConfig) {
	stopBot(roomId); // clean au cas ou il y avait deja un bot

	predictionIntervals.set(roomId, setInterval(() => { // recalcul de la prediction a chaque refresh (1 par secondes)
		const ball = room.game.state.ball;

		let goingToBot = false;
		if (side === 'right' && ball.velocity.posx > 0)
			goingToBot = true;
		else if (side === 'left' && ball.velocity.posx < 0)
			goingToBot = true;

		let prevGoing = false;
		const savedPrev = goingToBotMap.get(roomId);

		if (savedPrev !== undefined)
			prevGoing = savedPrev;

		const prevVy = prevVyMap.get(roomId);
		const curVy = ball.velocity.posy;

		let verticalChange = false;
		
		if (prevVy !== undefined && curVy !== prevVy)
			verticalChange = true;

		prevVyMap.set(roomId, curVy);

		// Si la balle ne va plus vers le bot alors qu’avant oui, on efface la prediction (surtout sur point marque)
		if (!goingToBot && prevGoing)
			predictionMap.delete(roomId);

		// recalcule la target prediction si la balle commence à venir ou si rebond sur mur
		if ((goingToBot && !prevGoing) || verticalChange) {
			const y = predictBallY(ball, config, side);
			predictionMap.set(roomId, y);
		}
		goingToBotMap.set(roomId, goingToBot);
	}, IA_REFRESH_INTERVAL));

	// envoi inputs
	inputIntervals.set(roomId, setInterval(() => {
		
		if (room.isPaused) {
			room.inputs[side] = { up: false, down: false };
			return;
		}
		
		const racquet = room.game.state.racquets[side];
		const centerY = racquet.posy + racquet.height / 2;
		const targetY = predictionMap.get(roomId);

		if (targetY === undefined) {
			room.inputs[side] = { up: false, down: false };
			return;
		}

		// Hesitation : 10% de chance de ne rien faire ce tick
		if (Math.random() < 0.1) {
			room.inputs[side] = { up: false, down: false };
			return;
		}

		const delta = targetY - centerY;
		const input: PlayerInput = { up: false, down: false };

		// Reaction normale
		if (delta < -4)
			input.up = true;
		else if (delta > 4)
			input.down = true;

		// Mouvement parasite : parfois le bot bouge sans raison (2% de chances)
		if (!input.up && !input.down && Math.random() < 0.02) {
			if (Math.random() < 0.5) 
				input.up = true;
			else 
				input.down = true;
		}

		room.inputs[side] = input;
	}, INPUT_INTERVAL));

}

// clean tout et stoppe le bot
export function stopBot(roomId: string) {
	clearInterval(predictionIntervals.get(roomId));
	clearInterval(inputIntervals.get(roomId));
	predictionIntervals.delete(roomId);
	inputIntervals.delete(roomId);
	predictionMap.delete(roomId);
	goingToBotMap.delete(roomId);
	prevVyMap.delete(roomId);
}
