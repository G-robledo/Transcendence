/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   controllersUtils.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:08:53 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:06 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Match, Slot, BracketMsg} from "./tournamentController"

// check JWT
export async function isTokenValid() {
	const token = localStorage.getItem('jwt');
	if (!token) {
		window.location.hash = 'login';
		return false;
	}
	try {
		const res = await fetch('/api/me', {
			headers: { 'Authorization': 'Bearer ' + token }
		});
		if (!res.ok) {
			localStorage.removeItem('jwt'); // clean storatge if token is KO
			window.location.hash = 'login';
			return false;
		}
		return true;
	} 
	catch (err) {
		localStorage.removeItem('jwt');
		window.location.hash = 'login';
		return false;
	}
}

// wait for Babylon js loading
export function loadBabylonScriptIfNeeded() {
	return new Promise((resolve, reject) => {
		if ((window as any).BABYLON) {
			resolve((window as any).BABYLON);
			return;
		}
		const script = document.createElement('script');
		script.src = "https://cdn.babylonjs.com/babylon.js";
		script.onload = () => resolve((window as any).BABYLON);
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

function canJoinMatch(match: any, username: string): boolean {
	if (!match || !username) 
		return false;
	return ((match.p1.name === username || match.p2.name === username) &&!!match.playerModes[username] && match.status !== "done");
}

// display overlay
export function showOverlay(overlay: HTMLElement | null, msg: string) {
	if (!overlay) 
		return;
	overlay.textContent = msg;
	overlay.style.display = "flex";
	setTimeout(() => {
		if (overlay) 
			overlay.style.display = "none";
	}, 4800);
}

// broadcast to server function
export function send(ws: WebSocket | null, action: string, data?: Record<string, any>) {
	if (!ws) {
		console.warn("WebSocket non initialise.");
		return;
	}
	if (ws.readyState !== WebSocket.OPEN) {
		console.warn("WebSocket non ouvert.");
		return;
	}
	const message = { action, ...data };
	ws.send(JSON.stringify(message));
}

// manage player waiting to join
export function updateSlotsList(
	slots: Slot[],
	slotsElem: HTMLElement | null,
	btnLaunch: HTMLButtonElement | null,
	btnAddBot: HTMLButtonElement | null,
	btnRemoveBot: HTMLButtonElement | null,
	btnJoin: HTMLButtonElement | null,
	btnQuit: HTMLButtonElement | null,
	myName: string,
	lastBracket: BracketMsg | null
) {
	if (!slotsElem) return;
	slotsElem.innerHTML = '';
	slots.forEach((s, idx) => {
		const li = document.createElement('li');
		li.className = "flex items-center gap-2 justify-center";
		let botLabel = "";
		if (s.isBot) {
			botLabel = ' <span class="italic text-sm text-gray-400">(Bot)</span>';
		}
		li.innerHTML = `<span class="font-mono">#${idx + 1}</span> <span>${s.name}${botLabel}</span>`;
		slotsElem.appendChild(li);
	});
	if (slots.length === 4 && !lastBracket && btnLaunch) {
		btnLaunch.style.display = "block";
	}
	else {
		if (btnLaunch)
			btnLaunch.style.display = "none";
	}
	if (btnAddBot)
		btnAddBot.disabled = !!lastBracket;
	if (btnRemoveBot)
		btnRemoveBot.disabled = !!lastBracket;
	if (btnJoin)
		btnJoin.disabled = !!lastBracket || slots.some(s => s.name === myName);

	if (btnQuit) {
		btnQuit.disabled = !!lastBracket;
	}
}

// create mod buttons on box game
export function createModeButtons(
	parentBox: HTMLElement,
	matchId: string,
	sendFn: (action: string, data?: Record<string, any>) => void
) {
	parentBox.innerHTML = ''; // clean container
	const btn2d = document.createElement("button");
	btn2d.textContent = "Mode 2D";
	btn2d.className = "btn-mode-choice mr-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg transition transform hover:scale-105 hover:brightness-110";
	const btn3d = document.createElement("button");
	btn3d.textContent = "Mode 3D";
	btn3d.className = "btn-mode-choice px-4 py-2 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold shadow-lg transition transform hover:scale-105 hover:brightness-110";

	btn2d.onclick = function() {
		sendFn("choose_mode", { matchId: matchId, mode: "2d" });
		btn2d.disabled = true;
		btn3d.disabled = true;
	};
	btn3d.onclick = function() {
		sendFn("choose_mode", { matchId: matchId, mode: "3d" });
		btn2d.disabled = true;
		btn3d.disabled = true;
	};
	parentBox.appendChild(btn2d);
	parentBox.appendChild(btn3d);
}

// create join button if valid mode
export function createJoinButton(
	parentBox: HTMLElement,
	matchId: string,
	sendFn: (action: string, data?: Record<string, any>) => void
): HTMLButtonElement | null {
	parentBox.innerHTML = ''; // clean container
	const btn = document.createElement("button") as HTMLButtonElement;
	btn.className = "btn-join-game mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg transition transform hover:scale-105 hover:brightness-110";
	parentBox.appendChild(btn);
	btn.onclick = function(event) {
		event.preventDefault();
		sendFn("start_match", { matchId: matchId });
	};
	btn.disabled = false;
	btn.textContent = "Rejoindre la partie";
	return btn;
}

// update bracket visuals
export function updateBracket(
	matches: Match[],
	final: Match | null,
	myName: string,
	btnLaunch: HTMLButtonElement,
	bracketM1P1: HTMLElement | null,
	bracketM1P2: HTMLElement | null,
	bracketM2P1: HTMLElement | null,
	bracketM2P2: HTMLElement | null,
	finalElem: HTMLElement | null,
	bracketM1Btns: HTMLElement | null,
	bracketM2Btns: HTMLElement | null,
	bracketFinalBtns: HTMLElement | null,
	send: (action: string, data?: Record<string, any>) => void
) {
	btnLaunch.style.display = "none";

	// game 1
	if (matches[0]) {
		if (bracketM1P1) 
			bracketM1P1.innerHTML = matches[0].p1.name + (matches[0].p1.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '');
		if (bracketM1P2) 
			bracketM1P2.innerHTML = matches[0].p2.name + (matches[0].p2.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '');

		if (bracketM1Btns) {
			bracketM1Btns.innerHTML = '';
			const isPlayer = myName === matches[0].p1.name || myName === matches[0].p2.name;
			const myMode = matches[0].playerModes[myName];

			if (isPlayer && matches[0].status === "waiting" && (!myMode || myMode === null)) {
				createModeButtons(bracketM1Btns, matches[0].id, send);
			}
			if (canJoinMatch(matches[0], myName)) {
				createJoinButton(bracketM1Btns, matches[0].id, send);
			}
		}
	}

	// game 2
	if (matches[1]) {
		if (bracketM2P1) 
			bracketM2P1.innerHTML = matches[1].p1.name + (matches[1].p1.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '');
		if (bracketM2P2) 
			bracketM2P2.innerHTML = matches[1].p2.name + (matches[1].p2.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '');

		if (bracketM2Btns) {
			bracketM2Btns.innerHTML = '';
			const isPlayer = myName === matches[1].p1.name || myName === matches[1].p2.name;
			const myMode = matches[1].playerModes[myName];

			if (isPlayer && matches[1].status === "waiting" && (!myMode || myMode === null)) {
				createModeButtons(bracketM2Btns, matches[1].id, send);
			}
			if (canJoinMatch(matches[1], myName)) {
				createJoinButton(bracketM2Btns, matches[1].id, send);
			}
		}
	}

	// final game
	if (finalElem && final) { finalElem.innerHTML = final.p1.name + (final.p1.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '') +' <span class="text-gray-400">VS</span> ' +
			final.p2.name + (final.p2.isBot ? ' <span class="italic text-xs text-gray-400">(Bot)</span>' : '');

		if (bracketFinalBtns) {
			bracketFinalBtns.innerHTML = '';

			const isPlayer = final.p1 && final.p2 && (myName === final.p1.name || myName === final.p2.name);

			const myMode = final.playerModes[myName];

			// display join button if player chosed a mode
			if (canJoinMatch(final, myName)) {
				createJoinButton(bracketFinalBtns, final.id, send);
			}

			if (final.status === "done" && final.winner) {
				finalElem.innerHTML =
					'<span class="text-yellow-300 font-bold">' +
					final.winner +
					" a gagne la finale !" +
					'</span>';
			}
		}
	}
}

	// check every ping to manage deconnexion
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;


	export function startHeartbeat() {
		if (heartbeatInterval) 
			clearInterval(heartbeatInterval);
		const token = localStorage.getItem('jwt');
		if (!token) return;
		heartbeatInterval = setInterval(async () => {
			try {
				const res = await fetch('/api/ping', {
					headers: { 'Authorization': 'Bearer ' + token }
				});
				const data = await res.json();
				console.log("[HEARTBEAT]", data);
			} 
			catch (event) {
				console.error("[HEARTBEAT] Erreur ping", event);
			}
		}, 30000); // every 30 seconds
	}

	export function stopHeartbeat() {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}

// Edit payload type
export type TokenPayload = {
	userId: number;
	username: string;
	iat?: number; // issued at
	exp?: number; // expiration
};

// get info in token
export function getTokenPayload(): TokenPayload | null
{
	const token: string | null = localStorage.getItem('jwt');
	if (!token)
	{
		return null;
	}
	const parts: string[] = token.split('.');
	if (parts.length !== 3)
	{
		return null;
	}
	try
	{
		const payload = JSON.parse(atob(parts[1]));
		if (typeof payload === "object" && payload !== null && "userId" in payload && "username" in payload)
		{
			return {
				userId: payload.userId,
				username: payload.username,
				iat: payload.iat,
				exp: payload.exp
			};
		}
		else
		{
			return null;
		}
	}
	catch (event)
	{
		console.error("[getTokenPayload] Erreur de decodage JWT", event);
		return null;
	}
}
