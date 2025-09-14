/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboardController.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:29:14 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:08 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid } from "./controllersUtils.js";

// Typage pour la reponse API des stats
type DashboardStats = {
	win: number;
	winrate: number;
	game_played: number;
	tournaments_played: number;
	tournaments_won: number;
};

// Typage pour chaque entree de l'historique
type MatchHistoryEntry = {
	id: number;
	played_at: string; // date
	opponent: string; // pseudo de l’adversaire ou "bot"
	score1: number;
	score2: number;
	result: "win" | "lose" | "draw";
};

export async function dashboardController(): Promise<void> {
	const valid: boolean = await isTokenValid();
	if (!valid) {
		window.location.hash = 'login';
		return;
	}

	const token = localStorage.getItem('jwt');
	if (!token) 
		return;

	// recup stat
	let stats: DashboardStats | null = null;
	try {
		const res = await fetch('/api/dashboard', {
			headers: { 'Authorization': 'Bearer ' + token }
		});
		if (!res.ok) 
			return;
		stats = await res.json();
	} 
	catch (event) {
		console.error("Erreur API dashboard:", event);
		return;
	}
	if (!stats) 
		return;

	const statMap: [string, keyof DashboardStats][] = [
		['stat-win', 'win'],
		['stat-winrate', 'winrate'],
		['stat-played', 'game_played'],
		['stat-tourn-played', 'tournaments_played'],
		['stat-tourn-win', 'tournaments_won']
	];
	for (const [id, key] of statMap) {
		const elem = document.getElementById(id);
		if (elem) {
			if (key === "winrate") {
				elem.textContent = (stats.winrate || 0) + "%";
			} 
			else {
				elem.textContent = stats[key]?.toString() ?? "0";
			}
		}
	}

	let history: MatchHistoryEntry[] = [];
	try {
		const res = await fetch('/api/history', {
			headers: { 'Authorization': 'Bearer ' + token }
		});
		if (!res.ok) return;
		history = await res.json();
	} 
	catch (event) {
		console.error("Erreur API history:", event);
		history = [];
	}
	// creation de l'historique
	const tbody = document.getElementById('history-table');
	if (tbody) {
		tbody.innerHTML = '';
		if (history.length === 0) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = 4;
			td.className = "text-center text-gray-400";
			td.textContent = "Aucune partie jouee pour l’instant.";
			tr.appendChild(td);
			tbody.appendChild(tr);
		} else {
			for (const entry of history) {
				const tr = document.createElement('tr');

				// Date
				const tdDate = document.createElement('td');
				const date = new Date(entry.played_at);
				tdDate.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);
				tdDate.className = "text-gray-600";
				tr.appendChild(tdDate);

				// Opponent (nom cliquable si pas "bot")
				const tdOpp = document.createElement('td');
				if (entry.opponent && entry.opponent !== "bot") {
					const btn = document.createElement('button');
					btn.textContent = entry.opponent;
					btn.className = "font-mono text-blue-400";
					btn.style.cursor = "pointer";
					btn.onclick = () => {
						window.location.hash = 'profile?u=' + encodeURIComponent(entry.opponent);
					};
					tdOpp.appendChild(btn);
				} else {
					tdOpp.textContent = "bot";
					tdOpp.className = "font-semibold text-gray-400";
				}
				tr.appendChild(tdOpp);

				// Score
				const tdScore = document.createElement('td');
				tdScore.textContent = `${entry.score1} - ${entry.score2}`;
				tr.appendChild(tdScore);

				// Resultat
				const tdResult = document.createElement('td');
				if (entry.result === "win") {
					tdResult.textContent = "Victoire";
					tdResult.className = "font-bold text-green-400 drop-shadow";
				} 
				else if (entry.result === "lose") {
					tdResult.textContent = "Defaite";
					tdResult.className = "font-bold text-red-400 drop-shadow";
				} 
				else {
					tdResult.textContent = "egalite";
					tdResult.className = "font-bold text-blue-400";
				}
				tr.appendChild(tdResult);

				tbody.appendChild(tr);
			}
		}
	}
}
