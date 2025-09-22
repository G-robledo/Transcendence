/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pong3d.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/22 21:08:22 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/11 15:48:09 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { GameState } from '../shared/type.js';
import * as BABYLON from 'babylonjs';

let babylonEngine: BABYLON.Engine | null = null;
let babylonScene: BABYLON.Scene | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let keyupHandler: ((event: KeyboardEvent) => void) | null = null;

// === CHARGEMENT Babylon + GUI ===
function loadBabylonWithGUI() {
	return new Promise((resolve, reject) => {
		function loadScript(src: string) {
			return new Promise((resolve, reject) => {
				const s = document.createElement('script');
				s.src = src;
				s.onload = resolve;
				s.onerror = reject;
				document.head.appendChild(s);
			});
		}
		async function go() {
			if (!(window as any).BABYLON)
				await loadScript("https://cdn.babylonjs.com/babylon.js");
			if (!(window as any).BABYLON?.GUI)
				await loadScript("https://cdn.babylonjs.com/gui/babylon.gui.min.js");
			if ((window as any).BABYLON && (window as any).BABYLON.GUI)
				resolve((window as any).BABYLON);
			else
				reject(new Error("Impossible de charger Babylon.js + GUI"));
		}
		go();
	});
}

// variable et game state
let wsMatchmaking: WebSocket | null = null;
let wsGame: WebSocket | null = null;

const WIDTH = 1280;
const HEIGHT = 640;
const RACQUET_HEIGHT = 76;
const RACQUET_WIDTH = 10;
const BALL_DIAMETER = 20;
const WALL_THICKNESS = 2;
const WALL_DEPTH = 30;

let gameState: GameState | null = null;
let playerSide: "left" | "right" | null = null;
let isPaused = false;
let endInfo: { winner: string } | null = null;
let pauseInfo: { scorer?: string, until?: number } | null = null;
let pauseTimerInterval: any = null;

// gestion websocket et imput



// Nettoie les sockets et l’etat (à appeler avant de quitter la page de jeu)
export function cleanupGame() {
	if (typeof wsGame !== "undefined" && wsGame) {
		if (wsGame.readyState === WebSocket.OPEN || wsGame.readyState === WebSocket.CONNECTING) {
			wsGame.close(1000, "Cleanup: user quit game page");
		}
		wsGame = null;
	}
	if (typeof wsMatchmaking !== "undefined" && wsMatchmaking) {
		if (wsMatchmaking.readyState === WebSocket.OPEN || wsMatchmaking.readyState === WebSocket.CONNECTING) {
			wsMatchmaking.close(1000, "Cleanup: user quit matchmaking");
		}
		wsMatchmaking = null;
	}
	isPaused = false;
	endInfo = null;
	pauseInfo = null;
	playerSide = null;
	gameState = null;
	if (typeof pauseTimerInterval !== "undefined" && pauseTimerInterval) {
		clearInterval(pauseTimerInterval);
		pauseTimerInterval = null;
	}
	if (keydownHandler) {
		window.removeEventListener('keydown', keydownHandler);
		keydownHandler = null;
	}
	if (keyupHandler) {
		window.removeEventListener('keyup', keyupHandler);
		keyupHandler = null;
	}

	if (babylonScene) {
		babylonScene.dispose();
		babylonScene = null;
	}
	if (babylonEngine) {
		babylonEngine.stopRenderLoop();
		babylonEngine.dispose();
		babylonEngine = null;
	}
}

// === INITIALISATION DU JEU (main entry) ===
export async function initGame() {
	const BABYLON = await loadBabylonWithGUI() as any;

	const canvas = document.getElementById('game');
	if (!canvas) 
		throw new Error('Canvas non trouve');
	const canvasElement = canvas as HTMLCanvasElement;
	canvasElement.width = WIDTH;
	canvasElement.height = HEIGHT;

	// Recup params URL
	let hash = window.location.hash;
	let paramsMatch = hash.match(/\?(.*)$/);
	let params: URLSearchParams;
	if (paramsMatch) {
		params = new URLSearchParams(paramsMatch[1]);
	} else {
		params = new URLSearchParams();
	}

	let matchmaking = 'pvp';
	let paramMatchmaking = params.get('matchmaking');
	if (paramMatchmaking !== null && paramMatchmaking !== undefined) {
		matchmaking = paramMatchmaking;
	}
	let token = localStorage.getItem('jwt') || '';
	let isTournament = params.has('tournament');

	// Connexion directe à la room si tournoi
	if (isTournament && params.has('room')) {
		const roomId = params.get('room');
		if (!roomId) 
			throw new Error("Room de tournoi manquante");
		startGameWS(roomId, null, null, BABYLON, canvasElement, matchmaking, isTournament);
		return;
	}

	// MATCHMAKING
	const wsURL = 'wss://' + window.location.hostname + ':8443/ws/matchmaking?mode=' + matchmaking + '&token=' + encodeURIComponent(token);
	console.log("[PONG3D] Ouverture WS matchmaking:", wsURL);
	wsMatchmaking = new WebSocket(wsURL);

	wsMatchmaking.onopen = function () {
		console.log('[PONG3D] WebSocket matchmaking ouvert:', wsURL);
	};

	wsMatchmaking.onclose = function () {
		console.log('[PONG3D] WebSocket matchmaking ferme.');
	};

	wsMatchmaking.onmessage = function (event) {
		const msg = JSON.parse(event.data);

		if (msg.type === "waiting") {
			const playerInfo = document.getElementById('playerInfo');
			if (playerInfo) 
				playerInfo.textContent = "Recherche d'un adversaire...";
		}
		if (msg.type === "match_found") {
			const roomId = msg.roomId;
			const side = msg.side;
			const opponent = msg.opponent;
			playerSide = side;
			if (wsMatchmaking) {
				wsMatchmaking.close();
				wsMatchmaking = null;
			}
			startGameWS(roomId, side, opponent, BABYLON, canvasElement, matchmaking, isTournament);
		}
	};

	wsMatchmaking.onerror = function (err) {
		console.error("[PONG3D] WebSocket matchmaking error:", err);
	};
}

// gestion websocket de jeu
function startGameWS(
	roomId: string,
	side: "left" | "right" | null,
	opponent: string | null,
	BABYLON: any,
	canvas: HTMLCanvasElement,
	matchmaking: string,
	isTournament: boolean
) {
	let token = localStorage.getItem('jwt') || '';
	let gameWSURL = 'wss://' + window.location.hostname + ':8443/ws/' + roomId + '?token=' + encodeURIComponent(token);
	console.log("[PONG3D] Ouverture WS game:", gameWSURL);
	wsGame = new WebSocket(gameWSURL);

	// gestion websocket matchmaking
	wsGame.onopen = function () {
		console.log('[PONG3D] WebSocket game ouvert:', gameWSURL);
		wsGame!.send(JSON.stringify({ type: "ready" }));
		const playerInfo = document.getElementById('playerInfo');
		if (playerInfo && side !== null) {
			let msg = "Tu es le joueur : " + side;
			if (matchmaking === 'bot') 
				msg = msg + " (tu joues contre un bot)";
			playerInfo.textContent = msg;
		}
	};
	wsGame.onclose = function () {
		console.log('[PONG3D] WebSocket game ferme.');
		if (pauseTimerInterval) 
			clearInterval(pauseTimerInterval);
	};
	wsGame.onmessage = function (event) {
		const msg = JSON.parse(event.data);

		if (msg.type === 'init') {
			playerSide = msg.player;
			const playerInfo = document.getElementById('playerInfo');
			if (playerInfo) {
				let msgText = "Tu es le joueur : " + playerSide;
				if (matchmaking === 'bot') 
					msgText = msgText + " (tu joues contre un bot)";
				playerInfo.textContent = msgText;
			}
			if (typeof messageText !== 'undefined') 
				messageText.text = "";
		}

		// affiche overlay + timer
		if (msg.type === "pause") {
			isPaused = true;
			pauseInfo = { scorer: msg.scorer, until: msg.until };
			// ENVOIE "ready" si tu es connecte au moment de la pause
			if (wsGame && wsGame.readyState === WebSocket.OPEN) {
				wsGame.send(JSON.stringify({ type: "ready" }));
			}
			if (pauseTimerInterval) 
				clearInterval(pauseTimerInterval);
			pauseTimerInterval = setInterval(() => {
				if (pauseInfo && pauseInfo.until) {
					const now = Date.now();
					const left = Math.max(0, Math.round((pauseInfo.until - now) / 1000));
					messageText.text = "En attente de l'adversaire... (" + left + "s)";
					if (left <= 0) {
						clearInterval(pauseTimerInterval);
						messageText.text = "";
					}
				}
			}, 250);
		}
		// on enleve overlay et timers
		if (msg.type === "resume") {
			isPaused = false;
			pauseInfo = null;
			if (pauseTimerInterval) {
				clearInterval(pauseTimerInterval);
				messageText.text = "";
			}
		}
		// affiche winner, puis redirige
		if (msg.type === "end") {
			isPaused = true;
			endInfo = { winner: msg.winner };
			pauseInfo = null;
			if (pauseTimerInterval) {
				clearInterval(pauseTimerInterval);
				messageText.text = "";
			}
			messageText.text = endInfo.winner + " gagne !";
			setTimeout(function () {
				messageText.text = "";
				if (isTournament) 
					window.location.hash = 'tournament';
				else window.location.hash = 'home';
			}, 2800);
		}
		// update du game state
		if (msg.state) {
			gameState = msg.state;
		}
	};

	// dessin 3d
	setupBabylonScene(BABYLON, canvas);

// Envoie input au serveur (uniquement si la game est active)
		// gestion des input et envoi au serveur
	const isLocalMode = (matchmaking === "local");

		// Variables pour online (1 joueur sur ce clavier)
	let keyUp = false, keyDown = false;

		// Variables pour local (2 joueurs sur ce clavier)
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
			} 
			else {
				wsGame.send(JSON.stringify({
					player: playerSide,
					input: { up: keyUp, down: keyDown } // si pas localmode 1 seule key a envoyer
				}));
			}
		}
	}
		let keydownHandler = function(event: KeyboardEvent) {
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
				keyUpRight = true;
				break;
			case 'l':
				keyDownRight = true;
				break;
			default: return;
		}
		sendInput();
	} 
	else {
		if (event.key === 'o' || event.key === 'w') { 
			keyUp = true;
			sendInput(); 
		}
		if (event.key === 'l' || event.key === 's') {
			keyDown = true;
			sendInput(); 
		}
	}
};

let keyupHandler = function(event: KeyboardEvent) {
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
			case 'l':
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
		if (event.key === 'l' || event.key === 's') {
			keyDown = false;
			sendInput();
		}
	}
};

window.addEventListener('keydown', keydownHandler);
window.addEventListener('keyup', keyupHandler);

}

let messageText: any = undefined; // Accessible dans wsGame.onmessage pour le texte de pause

function setupBabylonScene(BABYLON: any, canvas: HTMLCanvasElement) {
	// creation de la scene 
	babylonEngine = new BABYLON.Engine(canvas, true);
	babylonScene = new BABYLON.Scene(babylonEngine);

	if (babylonScene)
		babylonScene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

	// const glowLayer = new BABYLON.GlowLayer("glow", babylonScene, {
	// 	mainTextureFixedSize: 2048,
	// 	blurKernelSize: 64
	// });
	// glowLayer.intensity = 0.50;

	// recup couleur proche de celle du menu
	const neonBlue = new BABYLON.Color3(0.38, 0.65, 0.98); // #60a5fa blue-400
	const neonOutline = new BABYLON.Color3(0.14, 0.39, 0.92); // #2563eb blue-600

	// Camera simple, vue de dessus
	const camera = new BABYLON.FreeCamera('camera1', new BABYLON.Vector3(0, 0, -900), babylonScene);
	camera.setTarget(BABYLON.Vector3.Zero());
	camera.attachControl(canvas, true);
	camera.speed = 15;

	// Lumière blanche
	const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(1, 1, 0), babylonScene);
	light.intensity = 0.6;

	// Materiau neon bleu
	const neonMat = new BABYLON.StandardMaterial('neonMat', babylonScene);
	neonMat.diffuseColor = neonBlue;
	neonMat.emissiveColor = neonBlue;
	neonMat.specularColor = neonOutline;

	// Materiau murs gris clair
	const wallMat = new BABYLON.StandardMaterial('wallMat', babylonScene);
	wallMat.diffuseColor = new BABYLON.Color3(0.18, 0.21, 0.26); // gris bleute
	wallMat.emissiveColor = new BABYLON.Color3(0.18, 0.21, 0.26);

	// Raquettes Pong neon
	const racquetLeft = BABYLON.MeshBuilder.CreateBox('racquetLeft', { height: RACQUET_HEIGHT, width: RACQUET_WIDTH, depth: 12 }, babylonScene);
	racquetLeft.position.x = -WIDTH / 2 + RACQUET_WIDTH / 2 + WALL_THICKNESS / 2;
	racquetLeft.position.z = 0;
	racquetLeft.material = neonMat;
	racquetLeft.outlineWidth = 2.0;
	racquetLeft.outlineColor = neonOutline;
	racquetLeft.renderOutline = true;

	const racquetRight = BABYLON.MeshBuilder.CreateBox('racquetRight', { height: RACQUET_HEIGHT, width: RACQUET_WIDTH, depth: 12 }, babylonScene);
	racquetRight.position.x = WIDTH / 2 - RACQUET_WIDTH / 2 - WALL_THICKNESS / 2;
	racquetRight.position.z = 0;
	racquetRight.material = neonMat;
	racquetRight.outlineWidth = 2.0;
	racquetRight.outlineColor = neonOutline;
	racquetRight.renderOutline = true;

	// Balle Pong neon
	const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: BALL_DIAMETER }, babylonScene);
	ball.material = neonMat;
	ball.outlineWidth = 2.0;
	ball.outlineColor = neonOutline;
	ball.renderOutline = true;

	// Filet central neon (20 segments)
	const netCount = 20;
	const netHeight = 15;
	for (let i = 0; i < netCount; i++) {
		const netPiece = BABYLON.MeshBuilder.CreateBox('netPiece' + i, {
			width: 6,
			height: netHeight,
			depth: 6
		}, babylonScene);
		netPiece.position.x = 0;
		netPiece.position.y = HEIGHT / 2 - (i * HEIGHT / netCount) - netHeight / 2;
		netPiece.position.z = 1;
		netPiece.material = neonMat;
		netPiece.outlineWidth = 2.0;
		netPiece.outlineColor = neonOutline;
		netPiece.renderOutline = true;
	}

	// Sol retro style bleu/noir
	const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: WIDTH, height: HEIGHT }, babylonScene);
	const groundMat = new BABYLON.StandardMaterial("groundMat", babylonScene);
	groundMat.diffuseColor = new BABYLON.Color3(0.07, 0.09, 0.18); // #101827
	groundMat.emissiveColor = new BABYLON.Color3(0.07, 0.09, 0.18);
	ground.material = groundMat;
	ground.position.z = -6;

	// Murs Pong
	const wallTop = BABYLON.MeshBuilder.CreateBox('wallTop', { width: WIDTH, height: WALL_THICKNESS, depth: WALL_DEPTH }, babylonScene);
	wallTop.position.y = HEIGHT / 2;
	wallTop.material = wallMat;
	wallTop.outlineWidth = 1.0;
	wallTop.outlineColor = neonOutline;
	wallTop.renderOutline = true;

	const wallBottom = BABYLON.MeshBuilder.CreateBox('wallBottom', { width: WIDTH, height: WALL_THICKNESS, depth: WALL_DEPTH }, babylonScene);
	wallBottom.position.y = -HEIGHT / 2;
	wallBottom.material = wallMat;
	wallBottom.outlineWidth = 1.0;
	wallBottom.outlineColor = neonOutline;
	wallBottom.renderOutline = true;

	// overlay GUI pour messages et score
	const gui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

	// Gestion du score style neon bleu
	const scoreText = new BABYLON.GUI.TextBlock();
	scoreText.color = "#60a5fa"; // blue-400
	scoreText.outlineColor = "#2563eb"; // blue-600
	scoreText.outlineWidth = 6;
	scoreText.fontFamily = "monospace";
	scoreText.fontSize = "36px";
	scoreText.top = "-270px";
	scoreText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
	scoreText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
	gui.addControl(scoreText);

	// Messages overlay neon bleu
	messageText = new BABYLON.GUI.TextBlock();
	messageText.color = "#60a5fa";
	messageText.outlineColor = "#2563eb";
	messageText.outlineWidth = 8;
	messageText.fontFamily = "monospace";
	messageText.fontSize = "44px";
	messageText.text = "";
	messageText.top = "0px";
	messageText.height = "70px";
	messageText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
	messageText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
	gui.addControl(messageText);

	// render 3d (update positions et score)
	if (babylonScene){
		babylonScene.onBeforeRenderObservable.add(function () {
			if (gameState === null) {
				scoreText.text = "";
				return;
			}
			const racquets = gameState.racquets;
			const b = gameState.ball;

			racquetLeft.position.y = HEIGHT / 2 - racquets.left.posy - RACQUET_HEIGHT / 2;
			racquetRight.position.y = HEIGHT / 2 - racquets.right.posy - RACQUET_HEIGHT / 2;
			ball.position.x = b.position.posx - WIDTH / 2;
			ball.position.y = HEIGHT / 2 - b.position.posy;

			// Score
			scoreText.text = gameState.score.left.toString() + "   " + gameState.score.right.toString();
		});

		if (babylonEngine){
			babylonEngine.runRenderLoop(function () {
				if (babylonScene)
					babylonScene.render();
			});
		}
		window.addEventListener('resize', function () {
			if (babylonEngine)
				babylonEngine.resize();
		});
	}
}

