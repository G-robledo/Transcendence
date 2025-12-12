/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   2faController.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:30:40 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:05 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid } from "./controllersUtils.js";



export async function twoFaSetupController() {
	console.log("2faSetupController appele");

	if (!(await isTokenValid())) return;

	// get all html element
	const btn = document.getElementById('activate2fa');
	const qrContainer = document.getElementById('qrcode-container');
	const qrElem = document.getElementById('qrcode');
	const secretElem = document.getElementById('secret');
	const form = document.getElementById('validate-2fa');
	const result = document.getElementById('2fa-result');

	let currentSecret: string | null = null;

	if (!btn || !qrContainer || !qrElem || !secretElem || !form || !result) {
		console.error('elements manquants sur la page 2FA');
		return;
	}

	// if click on 2fa create qr code
	btn.addEventListener('click', async () => {
		const btn = document.getElementById('activate2fa') as HTMLButtonElement | null;
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Generation...";
		}
		result.textContent = "";
		try {
			console.log("[2FA Front] Requête POST /api/2fasetup envoyee");
			const res = await fetch('/api/2fasetup', {
				method: 'POST',
				headers: {
					'Authorization': 'Bearer ' + localStorage.getItem('jwt')
				}
			});
			const data = await res.json();
			console.log("[2FA Front] Reponse reçue de /api/2fasetup:", data);
			if (res.ok && data.qr && data.secret) {
				qrElem.innerHTML = `<img src="${data.qr}" alt="QR code 2FA" class="mx-auto" />`;
				secretElem.textContent = data.secret;
				qrContainer.style.display = "block";
				currentSecret = data.secret;
			} 
			else {
				result.textContent = data.error || "Erreur lors de la generation du QR code.";
			}
		} 
		catch (event) {
			console.error("[2FA Front] Erreur lors de la requête /api/2fasetup:", event);
			result.textContent = "Erreur reseau lors de la generation du QR code.";
		}
		if (btn){
			btn.textContent = "Activer 2FA";
			btn.disabled = false;
		}
	});

	// check if TOTP code is valid
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		result.textContent = "";
		const codeInput = document.getElementById('code2fa') as HTMLInputElement | null;
		if (!codeInput || !currentSecret) {
			result.textContent = "Erreur interne";
			return;
		}
		const code = codeInput.value.trim();
		if (!/^\d{6}$/.test(code)) {
			result.textContent = "Code invalide (6 chiffres)";
			return;
		}
		try {
			console.log("[2FA Front] POST /api/verify2fa body:", { code, secret: currentSecret });
			const res = await fetch('/api/verify2fa', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('jwt') },
				body: JSON.stringify({ code, secret: currentSecret })
			});
			const data = await res.json();
			console.log("[2FA Front] Reponse reçue de /api/verify2fa:", data);
			// if ok redirect to profile
			if (res.ok && data.success) {
				result.style.color = "green";
				result.textContent = "2FA activee ! Redirection...";
				setTimeout(() => {
					window.location.hash = 'profile';
				}, 1200);
			} 
			// else 
			else {
				result.style.color = "red";
				result.textContent = data.error || "Code invalide.";
			}
		} 
		catch (err) {
			console.error("[2FA Front] Erreur lors de la requête /api/verify2fa:", err);
			result.textContent = "Erreur de connexion au serveur";
		}
	});
}