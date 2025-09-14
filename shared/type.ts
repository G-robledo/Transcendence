/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   type.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/05/31 11:46:46 by grobledo          #+#    #+#             */
/*   Updated: 2025/06/30 10:41:44 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type PlayerId = "left" | "right";

export type Vec2 = {
	posx: number;
	posy: number;
};

export type Ball = {
	position: Vec2;
	velocity: Vec2;
	radius: number;
};

export type Racquet = {
	posy: number;
	height: number;
	speed: number;
};

export type PlayerInput = {
	up: boolean;
	down: boolean;
};

export type GameState = {
	ball: Ball;
	racquets: Record<PlayerId, Racquet>;   // { left: Racquet, right: Racquet }
	score: Record<PlayerId, number>;       // { left: number, right: number }
};

export type InputMessage = {
	player: PlayerId;
	input: PlayerInput;
};

export type OutputMessage = {
	state: GameState;
};

export interface GameConfig {
	width: number;
	height: number;
	racquetHeight: number;
	racquetWidth: number;
	racquetSpeed: number;
	initialBallSpeed: number;
	ballSpeedFactor: number;
	ballSpeed: number;
	ballRadius: number;
	maxBallSpeed: number;
}
