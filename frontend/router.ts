/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   router.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:08:29 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:02 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { routes } from './routeshtml.js';
import { stopHeartbeat } from "./controllers/controllersUtils.js";

export class Router {
	routes: any;
	lastCleanup: (() => void) | null = null; // stocke la dernière fonction de cleanup

	constructor(routes: any) {
		this.routes = routes;
		setupNavListeners();
		window.addEventListener('hashchange', this.handleRouteChange.bind(this));
		window.addEventListener('DOMContentLoaded', this.handleRouteChange.bind(this)); // affiche la bonne route au chargement de la page
	}

	async handleRouteChange() {
		updateNavigation();
		// appelle cleanup de la page html precedente si il existe
		if (typeof this.lastCleanup === "function") {
			try { 
				this.lastCleanup(); 
			} 
			catch(event) { 
				console.warn("Erreur cleanup precedent:", event); 
			}
			this.lastCleanup = null;
		}
		// recup hash de la nouvelle route
		let hash = window.location.hash.slice(1) || '';
		if (hash === '') {
			// Redirige vers home si aucun hash
			window.location.hash = 'home';
			return;
		}
		// cherche la bonne route
		const [routeKey] = hash.split('?');
		const route = this.routes[routeKey];
		// recupere le body html de la bonne page
		const content = document.getElementById('content');
		if (!content) 
			return;

		if (route && route.html) {
			const res = await fetch(route.html);
			content.innerHTML = await res.text();
			if (typeof route.controller === 'function') {
				console.log('Appel du controller:', route.controller.name); // appelle le controller de la focntion
				const cleanup = await route.controller();
				if (cleanup && typeof cleanup === "function") {
					this.lastCleanup = cleanup;
				} 
				else {
					this.lastCleanup = null;
				}
			}
		} 
		else {
			content.innerHTML = '<h1>404 Not Found</h1>';
		}
	}
}

// gere l'affichage de la barre de navigation en haut
function updateNavigation() {
	const nav = document.getElementById('main-nav');
	if (!nav) 
		return;
	const hash = window.location.hash.split('?')[0].replace(/^#/, "");
	const hideOn = ['login', 'register'];
	if (hideOn.includes(hash)) {
		nav.style.display = 'none';
	} else {
		nav.style.display = '';
		updateNavUserbox();
	}
}

// gere l'affichage de l'avatar + pseudo
export async function updateNavUserbox() {
	const navUserbox = document.getElementById('nav-userbox') as HTMLElement;
	const navAvatar  = document.getElementById('nav-avatar') as HTMLImageElement;
	const navUsername = document.getElementById('nav-username') as HTMLElement;

	if (!navUserbox || !navAvatar || !navUsername) 
		return;

	const token = localStorage.getItem('jwt');
	if (!token) {
		navUserbox.style.display = "none";
		return;
	}

	try {
		const res = await fetch('/api/me', {
			headers: { 'Authorization': 'Bearer ' + token }
		});
		if (!res.ok) 
			throw new Error("API fail");
		const data = await res.json();

		navAvatar.src = (data.avatarUrl || "/avatars/avatar_default.png") + "?v=" + Date.now();
		navAvatar.alt = data.username || "";
		navUsername.textContent = data.username || "";

		navUserbox.style.display = "";
		navAvatar.classList.remove('hidden');
		navUsername.classList.remove('hidden');
	} 
	catch {
		navUserbox.style.display = "none";
	}
}

// met en place les event de click sur tout les element de la navbar
function setupNavListeners() {
	const navHome     = document.getElementById('nav-home');
	const navHistory  = document.getElementById('nav-history');
	const navProfile  = document.getElementById('nav-profile');
	const navLogout   = document.getElementById('nav-logout');

	if (navHome)
		navHome.addEventListener('click', () => { window.location.hash = 'home'; });
	if (navHistory) 
		navHistory.addEventListener('click', () => { window.location.hash = 'history'; });
	if (navProfile) 
		navProfile.addEventListener('click', () => { window.location.hash = 'profile'; });

	if (navLogout) {
		navLogout.addEventListener('click', async () => {
			const token = localStorage.getItem('jwt');
			if (token) {
				try {
					await fetch('/api/logout', {
						method: 'POST',
						headers: { 'Authorization': 'Bearer ' + token }
					});
				} 
				catch (event) {
					console.warn('Erreur lors de la deconnexion', event);
				}
			}
			localStorage.removeItem('jwt');
			stopHeartbeat();
			window.location.hash = 'login'; // updateNavigation va tout cacher

			// Cache la userbox (avatar + pseudo) directement après deconnexion (securite la barre de nav le fais deja)
			const userbox = document.getElementById('nav-userbox');
			if (userbox) 
				userbox.style.display = 'none';
		});
	}

	// Toujours mettre à jour la userbox lors du setup nav (ex: après reload)
	updateNavUserbox();
}


(window as any).Router = Router;
