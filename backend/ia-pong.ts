/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ia-pong.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/12 12:46:37 by grobledo          #+#    #+#             */
/*   Updated: 2025/12/11 20:06:25 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PlayerId, PlayerInput } from '../shared/type.js';
import type { GameRoom } from './wsHandler.js';
import type { Ball, GameConfig } from '../shared/type.js';


const IA_REFRESH_INTERVAL = 1000; // frequence prediction ia
const INPUT_INTERVAL = 1000 / 60;// frequence input

const predictionMap = new Map<string, number>(); // target du bot per room
const goingToBotMap = new Map<string, boolean>(); // ball go to player or not
const prevVyMap = new Map<string, number>(); // previous speed of ball
const predictionIntervals = new Map<string, NodeJS.Timeout>();
const inputIntervals = new Map<string, NodeJS.Timeout>();

function predictBallY(ball: Ball, config: GameConfig, side: PlayerId): number { // algo prediction
	let { posx: x, posy: y } = ball.position;
	let { posx: vx, posy: vy } = ball.velocity;
	let targetX = 0;

	if (side === 'right')
		targetX = config.width - config.racquetWidth;
	else
		targetX = config.racquetWidth; // wich side is bot?

	for (let steps = 0; steps < 1000; steps++) { // simulation traj ball for 1000 step or to a side  prevent infinite loop
		if ((side === 'right' && x >= targetX) || (side === 'left' && x <= targetX)) break;
		x += vx;
		y += vy;

		if (y <= 0 || y >= config.height) {
			vy *= -1;
			y = Math.max(0, Math.min(config.height, y)); // if ball tocuh a wall y is inverted
		}
	}
	return y;
}

export function startBot(roomId: string, room: GameRoom, side: PlayerId, config: GameConfig) {
	stopBot(roomId); // clean if alreaady a bot

	predictionIntervals.set(roomId, setInterval(() => { // recalculation prediction each refresh (1 per seconds)
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

		// if ball stop to go in direction of the bot, erase prediction (especially on goal)
		if (!goingToBot && prevGoing)
			predictionMap.delete(roomId);

		// recalculation of target prediction if ball beegan go to bot or touch a wall
		if ((goingToBot && !prevGoing) || verticalChange) {
			const y = predictBallY(ball, config, side);
			predictionMap.set(roomId, y);
		}
		goingToBotMap.set(roomId, goingToBot);
	}, IA_REFRESH_INTERVAL));

	// send inputs
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

		// Hesitation : 10%to do nothing on this tick
		if (Math.random() < 0.1) {
			room.inputs[side] = { up: false, down: false };
			return;
		}

		const delta = targetY - centerY;
		const input: PlayerInput = { up: false, down: false };

		// Normal reaction
		if (delta < -4)
			input.up = true;
		else if (delta > 4)
			input.down = true;

		//  parasite Mouvment : bot moove from his own (2% chances)
		if (!input.up && !input.down && Math.random() < 0.02) {
			if (Math.random() < 0.5) 
				input.up = true;
			else 
				input.down = true;
		}

		room.inputs[side] = input;
	}, INPUT_INTERVAL));

}

// clean all and stop bot
export function stopBot(roomId: string) {
	clearInterval(predictionIntervals.get(roomId));
	clearInterval(inputIntervals.get(roomId));
	predictionIntervals.delete(roomId);
	inputIntervals.delete(roomId);
	predictionMap.delete(roomId);
	goingToBotMap.delete(roomId);
	prevVyMap.delete(roomId);
}
