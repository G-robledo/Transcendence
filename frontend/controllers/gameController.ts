/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gameController.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:25:56 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:09 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid, loadBabylonScriptIfNeeded } from "./controllersUtils.js";

let gameModule: any = null;

export async function gameController() {
	if (!(await isTokenValid())) 
		return;

	const playerInfo = document.getElementById('playerInfo');
	const canvas = document.getElementById('game');
	if (!canvas || !playerInfo) {
		console.error('Canvas ou playerInfo manquant sur la page game');
		return;
	}

	// Nettoyage d'une ancienne instance de jeu (si on repasse plusieurs fois sur game)
	if (gameModule && typeof gameModule.cleanupGame === "function") {
		gameModule.cleanupGame();
		gameModule = null;
	}

	//  Recupère mode depuis l'URL hash (ex : #game?mode=3d&matchmaking=pvp)
	let mode = "2d";
	const hash = window.location.hash;
	const paramsMatch = hash.match(/\?(.*)$/);
	if (paramsMatch) {
		const params = new URLSearchParams(paramsMatch[1]);
		const modeParam = params.get('mode');
		if (modeParam === "3d" || modeParam === "2d") {
			mode = modeParam;
		}
	}

	// Affiche l'info de connexion
	playerInfo.textContent = `Connexion en mode ${mode.toUpperCase()}...`;

	// Charge Babylon si besoin
	if (mode === "3d") {
		try {
			await loadBabylonScriptIfNeeded();
		} catch (err) {
			console.error("Erreur de chargement Babylon.js :", err);
			playerInfo.textContent = "Erreur lors du chargement de Babylon.js.";
			return;
		}
	}

	// Charge le module JS adapte
	const modulePath = mode === '3d' ? '/frontend/pong3d.js' : '/frontend/pong2d.js';

	try {
		const mod = await import(modulePath);
		gameModule = mod;
		if (typeof mod.initGame === "function") {
			mod.initGame();
		} 
		else {
			console.error('initGame() manquant dans le module', modulePath);
		}
	} 
	catch (event) {
		console.error('Erreur chargement module jeu:', event);
		playerInfo.textContent = "Erreur lors du chargement du jeu.";
	}

	/**
	 * Fonction de cleanup à retourner pour le router
	 */
	return function cleanup() {
		if (gameModule && typeof gameModule.cleanupGame === "function") {
			gameModule.cleanupGame();
			gameModule = null;
		}
	};
}
