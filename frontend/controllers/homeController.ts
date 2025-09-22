/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeController.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:24:40 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/11 13:55:06 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid } from "./controllersUtils.js";

export async function homeController() {
	// Verification du token AVANT tout le reste
	if (!(await isTokenValid())) 
		return;

	const modeSelect = document.getElementById('modeSelect') as HTMLSelectElement;
	let mode = '2d';
	if (modeSelect) {
		mode = modeSelect.value;
		modeSelect.addEventListener('change', () => {
			mode = modeSelect.value;
		});
	}

	const btnMatchmaking = document.getElementById('btn-matchmaking');
	const btnVsBot = document.getElementById('btn-vs-bot');
	const btnTournament = document.getElementById('btn-tournament');
	const btnLocal = document.getElementById('btn-local');


	if (btnLocal) {
		btnLocal.addEventListener('click', async () => {
			window.location.hash = `game?mode=${mode}&matchmaking=local`;
		});
	}

	if (btnMatchmaking) {
		btnMatchmaking.addEventListener('click', async () => {
			window.location.hash = `game?mode=${mode}&matchmaking=pvp`;
		});
	}

	if (btnVsBot) {
		btnVsBot.addEventListener('click', async () => {
			window.location.hash = `game?mode=${mode}&matchmaking=bot`;
		});
	}

	if (btnTournament) {
		btnTournament.addEventListener('click', async () => {
			window.location.hash = `tournament`; // Redirige sur la page tournoi
		});
	}
}
