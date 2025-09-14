/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   game.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/05/31 12:26:22 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/09 14:25:51 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { GameConfig, GameState, PlayerId, PlayerInput } from "../shared/type.js";

export class Game {
	private config: GameConfig;
	public state: GameState;

	constructor(config: GameConfig) {
		this.config = config;
		this.state = this.createInitialState();
	}

	private createInitialState(): GameState {
		return {
			ball: {
				position: { posx: this.config.width / 2, posy: this.config.height / 2 },
				velocity: { posx: this.config.initialBallSpeed, posy: 0 },
				radius: this.config.ballRadius
			},
			racquets: {
				left: { posy: this.config.height / 2, height: this.config.racquetHeight, speed: this.config.racquetSpeed },
				right: { posy: this.config.height / 2, height: this.config.racquetHeight, speed: this.config.racquetSpeed }
			},
			score: {
				left: 0,
				right: 0
			}
		};
	}

	public update(dt: number, input: Record<PlayerId, PlayerInput>): void {
		this.moveBall(dt);
		this.movePlayer('left', dt, input['left']);
		this.movePlayer('right', dt, input['right']);
		this.checkWallCollisions();
		this.checkRacquetCollisions();
		this.checkScore();
	}

	private moveBall(dt: number): void {
		this.state.ball.position.posx += this.state.ball.velocity.posx * dt;
		this.state.ball.position.posy += this.state.ball.velocity.posy * dt;
	}

	private checkWallCollisions(): void {
		const ball = this.state.ball;

		if (ball.position.posy - ball.radius <= 0 || ball.position.posy + ball.radius >= this.config.height) {
			ball.velocity.posy *= -1;
			ball.position.posy = Math.max(ball.radius, Math.min(ball.position.posy, this.config.height - ball.radius));
		}
	}

	private checkRacquetCollisions(): void {
		const { ball, racquets } = this.state;

		// check collision left
		const racquetLeft = racquets.left;
		const leftWithinY = ball.position.posy >= racquetLeft.posy && ball.position.posy <= racquetLeft.posy + racquetLeft.height;
		let touchingLeft = false;
		if (ball.position.posx - ball.radius <= this.config.racquetWidth)
			touchingLeft = true;
		if (touchingLeft && leftWithinY) {
			this.reflectBallFromRacquet('left');
			this.increaseBallSpeed();
		}

		// check collision right
		const racquetRight = racquets.right;
		const rightWithinY = ball.position.posy >= racquetRight.posy && ball.position.posy <= racquetRight.posy + racquetRight.height;
		let touchingRight = false;
		if (ball.position.posx + ball.radius >= this.config.width - this.config.racquetWidth)
			touchingRight = true;
		if (touchingRight && rightWithinY) {
			this.reflectBallFromRacquet('right');
			this.increaseBallSpeed();
		}
	}

	private reflectBallFromRacquet(player: PlayerId): void {
		const racquet = this.state.racquets[player];
		const ball = this.state.ball;

		const racquetCenter = racquet.posy + racquet.height / 2;
		const relativeY = (ball.position.posy - racquetCenter) / (racquet.height / 2);
		const maxBounceAngle = Math.PI / 3;

		const bounceAngle = relativeY * maxBounceAngle;
		const speed = Math.sqrt(ball.velocity.posx ** 2 + ball.velocity.posy ** 2);

		let direction = 1;
		if (player === 'right')
			direction = -1;

		ball.velocity.posx = Math.cos(bounceAngle) * speed * direction;
		ball.velocity.posy = Math.sin(bounceAngle) * speed;
	}

	private increaseBallSpeed(): void {
		const factor = this.config.ballSpeedFactor;
		const max = this.config.maxBallSpeed;

		let { posx, posy } = this.state.ball.velocity;

		posx *= factor;
		posy *= factor;

		const speed = Math.sqrt(posx ** 2 + posy ** 2);
		if (speed > max) {
			const scale = max / speed;
			posx *= scale;
			posy *= scale;
		}

		this.state.ball.velocity = { posx, posy };
	}

	private checkScore(): void {
		const { ball } = this.state;

		if (ball.position.posx + ball.radius < 0) {
			this.state.score.right++;
			this.resetBall();
			this.resetRacquet();
		} 
		else if (ball.position.posx - ball.radius > this.config.width) {
			this.state.score.left++;
			this.resetBall();
			this.resetRacquet();
		}
	}

	private resetBall(): void {
		const midX = this.config.width / 2;
		const midY = this.config.height / 2;
		const speed = this.config.initialBallSpeed;

		this.state.ball.position = { posx: midX, posy: midY };

		const angle = (Math.random() * Math.PI / 3) - (Math.PI / 6);
		let direction = 1;
		if (Math.random() <= 0.5)
			direction = -1;

		this.state.ball.velocity = {
			posx: Math.cos(angle) * speed * direction,
			posy: Math.sin(angle) * speed
		};
	}

	private resetRacquet(): void{

		const midY = this.config.height / 2;
		this.state.racquets.left.posy = midY;
		this.state.racquets.right.posy = midY;
	}

	private movePlayer(player: PlayerId, dt: number, input: PlayerInput): void {
		const racquet = this.state.racquets[player];
		const speed = this.config.racquetSpeed;

		if (input.up)
			racquet.posy -= speed * dt;
		if (input.down)
			racquet.posy += speed * dt;
		racquet.posy = Math.max(0, Math.min(racquet.posy, this.config.height - racquet.height));
	}
}
