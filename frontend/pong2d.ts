/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pong2d.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/11 16:58:15 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/11 15:43:15 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { GameState } from '../shared/type.js';

let wsMatchmaking: WebSocket | null = null;
let wsGame: WebSocket | null = null;
let isPaused = false;
let pauseInfo: { scorer?: string, until?: number } | null = null;
let endInfo: { winner: string } | null = null;
let playerSide: "left" | "right" | null = null;
let gameState: GameState | null = null;
let pauseTimerInterval: any = null;

// clean websocket and game state
export function cleanupGame() {
	// close game websocket if needed
	if (typeof wsGame !== "undefined" && wsGame) {
		if (wsGame.readyState === WebSocket.OPEN || wsGame.readyState === WebSocket.CONNECTING) {
			console.log("[FRONT][SOCKET] wsGame CLOSE demandee");
			wsGame.close(1000, "Cleanup: user quit game page");
		}
		wsGame = null;
	}
	// close matchmaking websocket if needed
	if (typeof wsMatchmaking !== "undefined" && wsMatchmaking) {
		if (wsMatchmaking.readyState === WebSocket.OPEN || wsMatchmaking.readyState === WebSocket.CONNECTING) {
			console.log("[FRONT][SOCKET] wsMatchmaking CLOSE demandee");
			wsMatchmaking.close(1000, "Cleanup: user quit matchmaking");
		}
		wsMatchmaking = null;
	}
	// reset game state
	isPaused = false;
	endInfo = null;
	pauseInfo = null;
	playerSide = null;
	gameState = null;
	// clean pause timer if exist
	if (typeof pauseTimerInterval !== "undefined" && pauseTimerInterval) {
		clearInterval(pauseTimerInterval);
		pauseTimerInterval = null;
		const pauseMsg = document.getElementById('pauseMsg');
		if (pauseMsg) 
			pauseMsg.textContent = "";
	}
}


export async function initGame() {
	const canvasElement = document.getElementById('game');
	if (!(canvasElement instanceof HTMLCanvasElement))
		throw new Error("Canvas manquant");
	const ctx = canvasElement.getContext('2d');
	if (!ctx) 
		throw new Error("Impossible d'obtenir le contexte 2D.");

	const width = 1280, height = 640;
	canvasElement.width = width;
	canvasElement.height = height;

	// url read
	const hash = window.location.hash;
	const paramsMatch = hash.match(/\?(.*)$/);
	const params = paramsMatch ? new URLSearchParams(paramsMatch[1]) : new URLSearchParams();
	const matchmaking = params.get('matchmaking') || 'pvp';
	const mode = params.get('mode') || '2d';
	const isTournament = params.has('tournament');
	const token = localStorage.getItem('jwt') || '';

	// call cleanupgame if page closed
	window.addEventListener('beforeunload', cleanupGame);

	// manage connexion to tournament room
	if (isTournament && params.has('room')) {
		const roomId = params.get('room');
		if (!roomId) 
			throw new Error("Room de tournoi manquante");
		startGameWS(roomId, null, null);
		return;
	}

	// Matchmaking WS
	let wsURL = `wss://${window.location.hostname}:8443/ws/matchmaking?mode=${matchmaking}&token=${encodeURIComponent(token)}`;
	console.log("[FRONT][SOCKET] Ouverture WS Matchmaking", wsURL);
	wsMatchmaking = new WebSocket(wsURL); // link socket with url

	// mange socket logs for open/close/error
	wsMatchmaking.onopen = function () {
		console.log("[FRONT][SOCKET] wsMatchmaking OPEN");
	};
	wsMatchmaking.onclose = function (event) {
		console.log("[FRONT][SOCKET] wsMatchmaking CLOSED", event.code, event.reason);
	};
	wsMatchmaking.onerror = function (err) {
		console.error("[FRONT][SOCKET] wsMatchmaking ERROR:", err);
	};

	// manage message recieved by server
	wsMatchmaking.onmessage = function (event) {
		const msg = JSON.parse(event.data);

		console.log("[FRONT][GAME][RECV]", msg, "tournament?", isTournament, "params", window.location.hash);

		// if waiting we are in matchmaking
		if (msg.type === "waiting") {
			const playerInfo = document.getElementById('playerInfo');
			if (playerInfo) 
				playerInfo.textContent = "Recherche d'un adversaire...";
		}
		// leave matchmaking if player found
		if (msg.type === "match_found") {
			playerSide = msg.side;
			if (wsMatchmaking) { 
				console.log("[FRONT][SOCKET] wsMatchmaking CLOSE car match trouve"); 
				wsMatchmaking.close(); 
				wsMatchmaking = null; 
			}
			startGameWS(msg.roomId, msg.side, msg.opponent);
		}
	};

	function startGameWS(roomId: string, side: "left" | "right" | null, opponent: string | null) {
		const gameWSURL = `wss://${window.location.hostname}:8443/ws/${roomId}?token=${encodeURIComponent(token)}`;
		console.log("[FRONT][SOCKET] Ouverture WS Game", gameWSURL);
		wsGame = new WebSocket(gameWSURL); // link socket with room id url

		// when socket open display opponent
		wsGame.onopen = function () {
			console.log("[FRONT][SOCKET] wsGame OPEN");
			const playerInfo = document.getElementById('playerInfo');
			if (playerInfo && side)
				playerInfo.textContent = "Tu es le joueur : " + side + (matchmaking === 'bot' ? ' (tu joues contre un bot)' : '');

			if (wsGame && wsGame.readyState === WebSocket.OPEN) {
				wsGame.send(JSON.stringify({ type: "ready" }));
			}
		};
		// when deconnexion stop timout (stop to recieve room log when disconnected)
		wsGame.onclose = function (event) {
			console.log("[FRONT][SOCKET] wsGame CLOSED", event.code, event.reason);
			if (pauseTimerInterval) {
				clearInterval(pauseTimerInterval);
				const pauseMsg = document.getElementById('pauseMsg');
				if (pauseMsg) 
					pauseMsg.textContent = ""; // clean pause message
			}
		};
		wsGame.onerror = function (err) {
			console.error("[FRONT][SOCKET] wsGame ERROR:", err);
		};

		wsGame.onmessage = function (event) {
			const msg = JSON.parse(event.data);
			if (msg.type === 'init') {
				playerSide = msg.player;
				const playerInfo = document.getElementById('playerInfo');
				if (playerInfo)
					playerInfo.textContent = "Tu es le joueur : " + playerSide + (matchmaking === 'bot' ? ' (tu joues contre un bot)' : '');
			}
			if (msg.type === "pause") {
				console.log("[FRONT][GAME] RECV PAUSE", msg);
				isPaused = true;
				pauseInfo = { until: msg.until };

				// send ready if connected during pause
				if (wsGame && wsGame.readyState === WebSocket.OPEN) {
					wsGame.send(JSON.stringify({ type: "ready" }));
				}
				// update overlay timer
				if (pauseTimerInterval) 
					clearInterval(pauseTimerInterval);
				pauseTimerInterval = setInterval(() => {
					if (pauseInfo && pauseInfo.until) {
						const left = Math.max(0, Math.round((pauseInfo.until - Date.now()) / 1000));
						const pauseMsg = document.getElementById('pauseMsg');
						if (pauseMsg) 
							pauseMsg.textContent = "En attente de l'adversaire... (" + left + "s)";
						if (left <= 0) {
							clearInterval(pauseTimerInterval);
							if (pauseMsg) 
								pauseMsg.textContent = "";
						}
					}
				}, 250);
			}
			// delete pause state and timeout
			if (msg.type === "resume") {
				console.log("[FRONT][GAME] RECV RESUME", msg);
				isPaused = false;
				pauseInfo = null;
				if (pauseTimerInterval) {
					clearInterval(pauseTimerInterval);
					pauseTimerInterval = null;
					const pauseMsg = document.getElementById('pauseMsg');
					if (pauseMsg) 
						pauseMsg.textContent = "";
				}
			}
			// redirect to good url when game over
			if (msg.type === "end") {
				console.log("[FRONT][GAME] RECV END", msg);
				isPaused = true;
				endInfo = { winner: msg.winner };
				pauseInfo = null;
				if (pauseTimerInterval) {
					clearInterval(pauseTimerInterval);
					const pauseMsg = document.getElementById('pauseMsg');
					if (pauseMsg) 
						pauseMsg.textContent = "";
				}
				setTimeout(() => {
					window.location.hash = isTournament ? 'tournament' : 'home';
				}, 3000);
			}
			if (msg.state) {
				gameState = msg.state;
			}
		};

		// input management
		const isLocalMode = (matchmaking === "local");

		// online variables (1 player on keyboard)
		let keyUp = false, keyDown = false;

		// local variables ( 2 players on keyboard)
		let keyUpLeft = false, keyDownLeft = false;
		let keyUpRight = false, keyDownRight = false;

		function sendInput() {
			if (wsGame && wsGame.readyState === WebSocket.OPEN && !isPaused && !endInfo) {
				if (isLocalMode) {
					wsGame.send(JSON.stringify({
						inputs: {
							left:  { up: keyUpLeft,  down: keyDownLeft  },
							right: { up: keyUpRight, down: keyDownRight }
						}
					}));
				} else {
					wsGame.send(JSON.stringify({
						player: playerSide,
						input: { up: keyUp, down: keyDown } // if online mod only one key is sent
					}));
				}
			}
		}

		window.addEventListener('keydown', (event) => {
			if (isPaused || endInfo) return;

			if (isLocalMode) {
				switch (event.key) {
					case 'w':
						keyUpLeft = true; 
						break;
					case 's':
						keyDownLeft = true;
						break;
					case 'o':
						keyUpRight   = true;
						break;
					case 'l':
						keyDownRight = true;
						break;
					default: return;
				}
				sendInput();
			} else {
				if (event.key === 'o' || event.key === 'w') { 
					keyUp = true;
					sendInput(); 
				}
				if (event.key === 'l' || event.key === 's') {
					keyDown = true;
					sendInput(); 
				}
			}
		});

		window.addEventListener('keyup', (event) => {
			if (isPaused || endInfo) return;

			if (isLocalMode) {
				switch (event.key) {
					case 'w':
						keyUpLeft = false;
						break;
					case 's':
						keyDownLeft = false;
						break;
					case 'o':
						keyUpRight = false;
						break;
					case "l":
						keyDownRight = false;
						break;
					default: return;
				}
				sendInput();
			} 
			else {
				if (event.key === 'o' || event.key === 'w') {
					keyUp = false;
					sendInput(); 
				}
				if (event.key === "l" || event.key === 's') {
					keyDown = false;
					sendInput();
				}
			}
		});

		// drawing function
		function draw() {
			if (!ctx) 
				throw new Error("Impossible d'obtenir le contexte 2D.");
			ctx.clearRect(0, 0, width, height);

			// dark background
			let gradient = ctx.createLinearGradient(0, 0, width, height);
			gradient.addColorStop(0, "#050B1E");
			gradient.addColorStop(1, "#111C44");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);

			if (gameState) {
				const { ball, racquets, score } = gameState;

				// central net
				ctx.save();
				ctx.strokeStyle = "#60a5fa";
				ctx.shadowColor = "#3b82f6";
				ctx.shadowBlur = 18;
				ctx.lineWidth = 6;
				ctx.beginPath();
				ctx.setLineDash([18, 20]);
				ctx.moveTo(width / 2, 0);
				ctx.lineTo(width / 2, height);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.restore();

				// racquets
				(["left", "right"] as const).forEach(side => {
					const r = racquets[side];
					ctx.save();
					ctx.fillStyle = "#60a5fa";
					ctx.shadowColor = "#2563eb";
					ctx.shadowBlur = 20;
					ctx.fillRect(
						side === "left" ? 0 : width - 10,
						r.posy,
						10,
						r.height
					);
					ctx.restore();
				});

				// Ball
				ctx.save();
				ctx.beginPath();
				ctx.arc(ball.position.posx, ball.position.posy, ball.radius, 0, 2 * Math.PI);
				ctx.fillStyle = "#60a5fa";
				ctx.shadowColor = "#2563eb";
				ctx.shadowBlur = 16;
				ctx.fill();
				ctx.restore();

				// Score
				ctx.save();
				ctx.font = "bold 40px monospace";
				ctx.textAlign = "center";
				ctx.fillStyle = "#60a5fa";
				ctx.shadowColor = "#2563eb";
				ctx.shadowBlur = 10;
				ctx.fillText(score.left.toString(), width / 4, 60);
				ctx.fillText(score.right.toString(), (width * 3) / 4, 60);
				ctx.restore();
			} 
			else {
				// waiting screen
				ctx.save();
				ctx.font = "bold 28px monospace";
				ctx.textAlign = "center";
				ctx.fillStyle = "#60a5fa";
				ctx.shadowColor = "#2563eb";
				ctx.shadowBlur = 12;
				ctx.fillText("En attente des joueurs...", width / 2, height / 2);
				ctx.restore();
				requestAnimationFrame(draw);
				return;
			}

			// Overlay PAUSE
			if (pauseInfo && pauseInfo.until) {
				const left = Math.max(0, Math.round((pauseInfo.until - Date.now()) / 1000));
				ctx.save();
				ctx.font = "bold 38px monospace";
				ctx.textAlign = "center";
				ctx.fillStyle = "#60a5fa";
				ctx.shadowColor = "#2563eb";
				ctx.shadowBlur = 16;
				ctx.fillText("En attente de l'adversaire... (" + left + "s)", width / 2, height / 2 + 80);
				ctx.restore();
			}

			// Overlay winner
			if (endInfo) {
				ctx.save();
				ctx.font = "bold 56px monospace";
				ctx.textAlign = "center";
				ctx.fillStyle = "#60a5fa";
				ctx.shadowColor = "#3b82f6";
				ctx.shadowBlur = 18;
				ctx.fillText(endInfo.winner + " gagne !", width / 2, height / 2);
				ctx.restore();
			}

			requestAnimationFrame(draw);
		}
		draw();

	}
}
