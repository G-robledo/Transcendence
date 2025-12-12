/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   registerController.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:24:02 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:16 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export function registerController() {
	console.log("registerController appele");

	const backBtn = document.getElementById('back-to-login-link');
	if (backBtn) {
		backBtn.addEventListener('click', () => {
			window.location.hash = 'login';
		});
	}

	const form = document.getElementById('register-form');
	const errorElem = document.getElementById('register-error') as HTMLElement | null;

	if (form) {
		form.addEventListener('submit', async (event) => {
			event.preventDefault(); // block automatic reload of the page

			const usernameInput = document.getElementById('register-username') as HTMLInputElement | null;
			const passwordInput = document.getElementById('register-password') as HTMLInputElement | null;

			if (!usernameInput || !passwordInput || !errorElem) {
				alert('Erreur interne, veuillez recharger la page.');
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
			
			// create username in db
			try {
				const res = await fetch('/api/users', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username, password }),
				});
				const data = await res.json();

				if (res.ok) {
					errorElem.style.color = "green";
					errorElem.textContent = "Inscription reussie ! Redirection...";
					setTimeout(() => {
						window.location.hash = 'login';
					}, 800);
				}
				else {
					errorElem.style.color = "red";
					errorElem.textContent = data.error || "Erreur inconnue";
				}
			} 
			catch (err) {
				errorElem.style.color = "red";
				errorElem.textContent = "Erreur de connexion au serveur";
			}
		});
	}
}