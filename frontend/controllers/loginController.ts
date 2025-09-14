/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   loginController.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:23:32 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:10 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { startHeartbeat } from "./controllersUtils.js";

export function loginController() {
	console.log("login controller appele");

	const registerBtn = document.getElementById('register-link');
	if (registerBtn) {
		registerBtn.addEventListener('click', () => {
			window.location.hash = 'register';
		});
	}

	const form = document.getElementById('login-form');
	const errorElem = document.getElementById('login-error');
	const twoFaDiv = document.getElementById('login-2fa-div');
	const twoFaInput = document.getElementById('login-2fa-input');
	const twoFaBtn = document.getElementById('login-2fa-btn');

	let pendingUserId: number | null = null;
	if (form) {
		form.addEventListener('submit', async (event) => {
			event.preventDefault();

			const usernameInput = document.getElementById('login-username') as HTMLInputElement | null;
			const passwordInput = document.getElementById('login-password') as HTMLInputElement | null;

			if (!usernameInput || !passwordInput || !errorElem) {
				alert("Erreur interne, veuillez recharger la page.");
				return;
			}

			const username = usernameInput.value.trim();
			const password = passwordInput.value.trim();

			errorElem.textContent = '';
			errorElem.style.color = "red";

			if (!username || !password) {
				errorElem.textContent = "Veuillez remplir tous les champs.";
				return;
			}

			try {
				const res = await fetch('/api/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username, password }),
				});
				const data = await res.json();

				if (res.ok && data.token) {
					localStorage.setItem('jwt', data.token);
					startHeartbeat();
					errorElem.style.color = "green";
					errorElem.textContent = "Connexion reussie ! Redirection...";
					setTimeout(() => {
						window.location.hash = 'home';
					}, 800);
				} 
				else if (data.require2fa && data.userId) {
					pendingUserId = data.userId;
					if (twoFaDiv) 
						twoFaDiv.style.display = "flex";
					errorElem.textContent = "Veuillez entrer votre code 2FA";
				} 
				else {
					errorElem.textContent = data.error || "Erreur inconnue";
				}
			} 
			catch (err) {
				errorElem.textContent = "Erreur de connexion au serveur";
			}
		});
	}

	// Gère la soumission du code 2FA si active
	if (twoFaBtn && twoFaInput) {
		twoFaBtn.addEventListener('click', async () => {
			const code = (twoFaInput as HTMLInputElement).value.trim();
			if ((!code || !pendingUserId) && errorElem) {
				errorElem.textContent = "Code 2FA requis";
				return;
			}
			if (!/^\d{6}$/.test(code) && errorElem) {
				errorElem.textContent = "Le code 2FA doit contenir 6 chiffres.";
				return;
			}
			try {
				const res = await fetch('/api/login2fa', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: pendingUserId, code }),
				});
				const data = await res.json();
				if (res.ok && data.token) {
					localStorage.setItem('jwt', data.token);
					startHeartbeat();
					if (errorElem){
						errorElem.style.color = "green";
						errorElem.textContent = "Connexion 2FA reussie ! Redirection...";
					}
					setTimeout(() => {
						window.location.hash = 'home';
					}, 800);
				} 
				else {
					if (errorElem){
						errorElem.style.color = "red";
						errorElem.textContent = data.error || "Code 2FA invalide.";
					}
				}
			} 
			catch (err) {
				if (errorElem)
					errorElem.textContent = "Erreur de connexion au serveur (2FA)";
			}
		});
	}
}