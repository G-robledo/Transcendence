/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tournamentController.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:31:54 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:18 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {isTokenValid, showOverlay, send, updateSlotsList, updateBracket } from "./controllersUtils.js";

// initialisation bracket buttons and overlays
// controller guard to have only one tournament controller at a time( refresh often to display brackets so no need to have severals controllers)
declare global {
	interface Window {
		__tournamentControllerGuard?: {
			active?: boolean;
			ws?: WebSocket | null;
		};
	}
}

export interface Slot {
	name: string;
	isBot: boolean;
}
export interface Match {
	id: string;
	p1: Slot;
	p2: Slot;
	status: "waiting" | "playing" | "done";
	winner: string | null;
	mode: "2d" | "3d" | null;
	roomId: string | null;
	playerModes: { [name: string]: "2d" | "3d" | null };
}
export interface BracketMsg {
	type: "bracket";
	matches: Match[];
	final: Match | null;
	you?: string;
}

if (!window.__tournamentControllerGuard) {
	window.__tournamentControllerGuard = {};
}
const controllerGuard = window.__tournamentControllerGuard;

let ws: WebSocket | null = null;
let myName = '';
let lastSlots: Slot[] = [];
let lastBracket: BracketMsg | null = null;

export async function tournamentController() {
	if (!(await isTokenValid())) {
		controllerGuard.active = false;
		return;
	}

	const statusElem = document.getElementById('tournament-status');
	const slotsElem = document.getElementById('tournament-slots');
	const btnJoin = document.getElementById('btn-join-tournament') as HTMLButtonElement;
	const btnQuit = document.getElementById('btn-quit-tournament') as HTMLButtonElement;
	const btnAddBot = document.getElementById('btn-add-bot') as HTMLButtonElement;
	const btnLaunch = document.getElementById('btn-launch-tournament') as HTMLButtonElement;
	let btnRemoveBot = document.getElementById('btn-remove-bot') as HTMLButtonElement | null;

	const bracketM1P1 = document.getElementById('bracket-m1p1');
	const bracketM1P2 = document.getElementById('bracket-m1p2');
	const bracketM2P1 = document.getElementById('bracket-m2p1');
	const bracketM2P2 = document.getElementById('bracket-m2p2');
	const finalElem = document.getElementById('bracket-final');

	const bracketM1Btns = document.getElementById('bracket-m1-btns');
	const bracketM2Btns = document.getElementById('bracket-m2-btns');
	const bracketFinalBtns = document.getElementById('bracket-final-btns');

	if (controllerGuard.active && controllerGuard.ws && controllerGuard.ws.readyState === WebSocket.OPEN) {
		updateSlotsList(
			lastSlots, slotsElem, btnLaunch, btnAddBot, btnRemoveBot, btnJoin, btnQuit, myName, lastBracket
		);
		if (lastBracket) {
			updateBracket(
				lastBracket.matches, lastBracket.final, myName,
				btnLaunch, bracketM1P1, bracketM1P2, bracketM2P1, bracketM2P2, finalElem,
				bracketM1Btns, bracketM2Btns, bracketFinalBtns,
				(action: string, data?: Record<string, any>) => send(ws, action, data)
			);
		}
		if (statusElem) 
			statusElem.textContent = "Connecte au tournoi.";
		return;
	}
	controllerGuard.active = true;

	ws = null;
	myName = '';
	lastSlots = [];
	lastBracket = null;

	[bracketM1P1, bracketM1P2, bracketM2P1, bracketM2P2, finalElem].forEach(elem => {
		if (elem) 
			elem.textContent = "…";
	});
	if (slotsElem) 
		slotsElem.innerHTML = "";
	if (btnLaunch) 
		btnLaunch.style.display = "none";
	if (statusElem) 
		statusElem.textContent = "Chargement...";

	if (!btnRemoveBot) {
		btnRemoveBot = document.createElement('button');
		btnRemoveBot.id = 'btn-remove-bot';
		btnRemoveBot.className = 'px-6 py-2 bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 rounded-lg text-white font-semibold shadow-lg transition transform hover:scale-105 hover:brightness-110';
		btnRemoveBot.textContent = "Enlever un bot";
		if (btnAddBot && btnAddBot.parentElement)
			btnAddBot.parentElement.appendChild(btnRemoveBot);
	}
	btnJoin.onclick = null;
	btnAddBot.onclick = null;
	if (btnRemoveBot) 
		btnRemoveBot.onclick = null;
	btnLaunch.onclick = null;
	if (btnQuit) 
		btnQuit.onclick = null;

	// unique overlay for all the page
	let overlay = document.getElementById('tournament-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'tournament-overlay';
		Object.assign(overlay.style, {
			position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh", zIndex: "9999",
			background: "rgba(0,0,0,0.86)", color: "#fff", fontSize: "2.2rem",
			display: "none", justifyContent: "center", alignItems: "center", fontFamily: "monospace", textAlign: "center"
		});
		document.body.appendChild(overlay);
	}


	function openWS() {
		if (ws) { // if socket already open close it properly
			ws.onclose = null;
			ws.close();
			ws = null;
		}
		const token = localStorage.getItem('jwt') || '';
		const wsUrl = 'wss://' + window.location.hostname + ':8443/ws/tournament?token=' + encodeURIComponent(token); // token in url -> instant authentification
		ws = new WebSocket(wsUrl); // open websocket with l'url
		controllerGuard.ws = ws;

		ws.onopen = () => { // connexion message when socket open
			if (statusElem) 
				statusElem.textContent = "Connecte au tournoi.";
		};
		ws.onclose = () => {// when socket close clean everything
			if (statusElem) 
				statusElem.textContent = "Deconnecte du tournoi.";
			if (slotsElem) 
				slotsElem.innerHTML = "";
			[bracketM1P1, bracketM1P2, bracketM2P1, bracketM2P2, finalElem].forEach(elem => {
				if (elem) 
					elem.textContent = "…";
			});
			if (btnLaunch) 
				btnLaunch.style.display = "none";
			lastBracket = null;
			lastSlots = [];
			myName = '';
			controllerGuard.active = false;
			controllerGuard.ws = null;
			// redirect to home page if disconnected
			window.location.hash = 'home';
		};
		// get message send by server
		ws.onmessage = function (event: MessageEvent) {
			let msg: any;
			try { msg = JSON.parse(event.data); }
			catch { return; }

			// update player list
			if (msg.type === "slots")
				updateSlotsList(
					msg.slots, slotsElem, btnLaunch, btnAddBot, btnRemoveBot, btnJoin, btnQuit, myName, lastBracket
				);
			// manage bracket display
			if (msg.type === "bracket") {
				if (typeof msg.you === 'string') {
					myName = msg.you;
				} else {
					controllerGuard.active = false;
					return;
				}
				lastBracket = msg;
				updateBracket(
					msg.matches, msg.final, myName,
					btnLaunch, bracketM1P1, bracketM1P2, bracketM2P1, bracketM2P2, finalElem,
					bracketM1Btns, bracketM2Btns, bracketFinalBtns,
					(action: string, data?: Record<string, any>) => send(ws, action, data)
				);

				if (lastSlots && Array.isArray(lastSlots))
					updateSlotsList(
						lastSlots, slotsElem, btnLaunch, btnAddBot, btnRemoveBot, btnJoin, btnQuit, myName, lastBracket
					);
			}

			// redirect message with room id
			if (msg.type === "goto_game" && msg.roomId && msg.mode) {
				window.location.hash = `game?mode=${msg.mode}&room=${msg.roomId}&tournament=1`;
			}
			// game over message
			if (msg.type === "tournament_over" && msg.winner) {
				showOverlay(overlay, msg.winner + " remporte le tournoi !");
				setTimeout(() => {
					const overlayElem = document.getElementById('tournament-overlay');
					if (overlayElem) 
						overlayElem.style.display = "none";
					window.location.hash = 'home';
				}, 5000);
			}
		};
	}

	btnJoin.onclick = () => send(ws, 'join');
	btnAddBot.onclick = () => send(ws, 'add_bot');
	if (btnRemoveBot)
		btnRemoveBot.onclick = () => send(ws, 'remove_bot');
	btnLaunch.onclick = () => send(ws, 'launch');
	if (btnQuit)
		btnQuit.onclick = () => send(ws, 'quit');

	openWS();
	
	// clean function for new tournament creation
	return function cleanupTournament() {
		if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
			console.log("[FRONT][SOCKET] wsTournament CLOSE demandee");
			ws.onclose = null; // block handler during cleanup
			ws.close(1000, "Cleanup: User quit tournament page");
		}
		ws = null;

		if (controllerGuard) {
			controllerGuard.active = false;
			controllerGuard.ws = null;
		}

		const overlayElem = document.getElementById('tournament-overlay');
		if (overlayElem) 
			overlayElem.style.display = "none";

		myName = '';
		lastSlots = [];
		lastBracket = null;
	};
}
