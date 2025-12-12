/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileController.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/04 18:28:27 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:49:15 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid, getTokenPayload } from "./controllersUtils.js";
import { updateNavUserbox } from "../router.js";

type ProfileResponse = {
	userId: number;
	username: string;
	avatarUrl?: string;
	has2fa?: boolean;
};

export async function profileController(): Promise<void> {
	const valid: boolean = await isTokenValid();
	if (!valid) {
		window.location.hash = 'login';
		return;
	}

	const tokenPayload = getTokenPayload();
	if (!tokenPayload) 
		return;
	const jwtUsername: string = tokenPayload.username;
	const jwtUserId: number = tokenPayload.userId;

	// get username to display
	let urlUsername: string | null = null;
	const hash = window.location.hash;
	const match = hash.match(/profile\?u=([^&]+)/);
	if (match) {
		urlUsername = decodeURIComponent(match[1]);
	}

	let profile: ProfileResponse | null = null;
	let isMyProfile = false;

	try {
		const token: string | null = localStorage.getItem('jwt');
		let res: Response;
		if (!urlUsername || urlUsername === jwtUsername) {
			// connected player profile
			res = await fetch('/api/me', {
				headers: { 'Authorization': 'Bearer ' + token }
			});
			if (!res.ok) 
				return;
			profile = await res.json();
			isMyProfile = true;
		} 
		else {
			// other player profile
			res = await fetch('/api/profile/' + encodeURIComponent(urlUsername), {
				headers: { 'Authorization': 'Bearer ' + token }
			});
			if (!res.ok) 
				return;
			profile = await res.json();
			isMyProfile = false;
		}
	} 
	catch (event) {
		console.error("Erreur API profil:", event);
		return;
	}
	if (profile === null) 
		return;

	//  DOM selector
	const avatar = document.getElementById('profile-avatar') as HTMLImageElement | null;
	const usernameElem = document.getElementById('profile-username');
	const editAvatarBtn = document.getElementById('edit-avatar-btn') as HTMLButtonElement | null;
	const editUsernameBtn = document.getElementById('edit-username-btn') as HTMLButtonElement | null;
	const extraActions = document.getElementById('profile-extra-actions');
	const activate2faBtn = document.getElementById('activate-2fa-btn') as HTMLButtonElement | null;
	const deleteAccountBtn = document.getElementById('delete-account-btn') as HTMLButtonElement | null;
	const info = document.getElementById('profile-info');
	const avatarInput = document.getElementById('avatar-input') as HTMLInputElement | null;
	const gdprBtn = document.getElementById('gdpr-link-btn') as HTMLButtonElement | null;

	// avatar display
	if (avatar) {
		if (profile.userId === 1) {
			avatar.src = "/avatars/avatar_deleted.png";
			avatar.classList.remove('hidden');
		} 
		else if (profile.avatarUrl) {
			avatar.src = profile.avatarUrl + '?v=' + Date.now();
			avatar.classList.remove('hidden');
		} 
		else {
			avatar.src = "/avatars/avatar_default.png";
			avatar.classList.remove('hidden');
		}
	}
	// Username
	if (usernameElem) {
		usernameElem.textContent = profile.username || '';
	}

	// display/hide buttons and edit zones
	if (editAvatarBtn) {
		if (isMyProfile) 
			editAvatarBtn.classList.remove('hidden');
		else editAvatarBtn.classList.add('hidden');
	}
	if (editUsernameBtn) {
		if (isMyProfile) 
			editUsernameBtn.classList.remove('hidden');
		else editUsernameBtn.classList.add('hidden');
	}
	if (extraActions) {
		if (isMyProfile) 
			extraActions.classList.remove('hidden');
		else extraActions.classList.add('hidden');
	}

	// add listeners if it's player connected profile
	if (isMyProfile) {
		// avatar management
		if (editAvatarBtn && avatarInput) {
			editAvatarBtn.onclick = () => {
				avatarInput.value = "";
				avatarInput.click();
			};
			avatarInput.onchange = async function () {
				const file = avatarInput.files && avatarInput.files[0];
				if (!file) 
					return;
				if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
					if (info) {
						info.style.color = "red";
						info.textContent = "Format non supporte.";
					}
					return;
				}
				if (file.size > 2 * 1024 * 1024) {
					if (info) {
						info.style.color = "red";
						info.textContent = "Image trop lourde (max 2 Mo).";
					}
					return;
				}
				const token: string | null = localStorage.getItem('jwt');
				const formData = new FormData();
				formData.append('avatar', file);
				if (info) {
					info.style.color = "gray";
					info.textContent = "Upload de l'avatar...";
				}
				const res = await fetch('/api/upload-avatar', {
					method: 'POST',
					headers: { 'Authorization': 'Bearer ' + token },
					body: formData
				});
				const data = await res.json();
				if (res.ok && data.success) {
					if (avatar) {
						avatar.src = data.avatarUrl + '?v=' + Date.now();
						avatar.classList.remove('hidden');
					}
					if (info) {
						info.style.color = "green";
						info.textContent = "Avatar mis à jour!";
					}
				} 
				else {
					if (info) {
						info.style.color = "red";
						info.textContent = data.error || "Erreur lors de l'upload de l'avatar.";
					}
				}
				if (gdprBtn) {
					gdprBtn.onclick = function () {
						window.location.hash = "gdpr";
					};
				}
				if (typeof updateNavUserbox === "function") updateNavUserbox();
			};
		}

		// change username
		if (editUsernameBtn) {
			editUsernameBtn.onclick = async function () {
				const newUsername: string | null = prompt("Nouveau pseudo :", profile.username);
				if (!newUsername || newUsername === profile.username) {
					if (info) info.textContent = "Pseudo non modifie.";
					return;
				}
				try {
					const token: string | null = localStorage.getItem('jwt');
					const res: Response = await fetch('/api/change-username', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': 'Bearer ' + token
						},
						body: JSON.stringify({ newUsername })
					});
					const data: { success?: boolean; error?: string; token?: string } = await res.json();

					if (res.ok && data.success) {
						if (data.token) {
							localStorage.setItem('jwt', data.token);
						}
						if (info) {
							info.style.color = "green";
							info.textContent = "Pseudo modifie avec succès!";
						}
						if (usernameElem) {
							usernameElem.textContent = newUsername;
						}
						location.reload();
					} 
					else {
						if (info) {
							info.style.color = "red";
							info.textContent = data.error || "Erreur lors du changement de pseudo.";
						}
					}
				} 
				catch (event) {
					if (info) {
						info.style.color = "red";
						info.textContent = "Erreur de connexion serveur.";
					}
				}
			};
		}

		// change password
		const changePwdBtn = document.getElementById('change-password-btn') as HTMLButtonElement | null;
		if (changePwdBtn) {
			changePwdBtn.onclick = async function () {
				const oldPwdElem = document.getElementById('old-password') as HTMLInputElement | null;
				const newPwdElem = document.getElementById('new-password') as HTMLInputElement | null;
				if (!oldPwdElem || !newPwdElem) {
					if (info) 
						info.textContent = "Champs de mot de passe manquants.";
					return;
				}
				const oldPassword: string = oldPwdElem.value;
				const newPassword: string = newPwdElem.value;
				if (!oldPassword || !newPassword) {
					if (info) 
						info.textContent = "Remplis les deux champs de mot de passe.";
					return;
				}
				try {
					const token: string | null = localStorage.getItem('jwt');
					const res: Response = await fetch('/api/change-password', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': 'Bearer ' + token
						},
						body: JSON.stringify({ oldPassword, newPassword })
					});
					const data: { success?: boolean; error?: string } = await res.json();
					if (res.ok && data.success) {
						if (info) {
							info.style.color = "green";
							info.textContent = "Mot de passe modifie!";
						}
						oldPwdElem.value = '';
						newPwdElem.value = '';
					} 
					else {
						if (info) {
							info.style.color = "red";
							info.textContent = data.error || "Erreur lors du changement de mot de passe.";
						}
					}
				} 
				catch (event) {
					if (info) {
						info.style.color = "red";
						info.textContent = "Erreur de connexion serveur.";
					}
				}
			};
		}

		// activation/desactivation 2fa
		if (activate2faBtn) {
			if (profile.has2fa) {
				activate2faBtn.textContent = "Desactiver la double authentification";
				activate2faBtn.onclick = async function () {
					if (!confirm("Desactiver la double authentification?")) 
						return;
					const token: string | null = localStorage.getItem('jwt');
					const res = await fetch('/api/disable-2fa', {
						method: 'POST',
						headers: { 'Authorization': 'Bearer ' + token }
					});
					const data = await res.json();
					if (res.ok && data.success) {
						if (info) {
							info.style.color = "green";
							info.textContent = "2FA desactivee!";
						}
						activate2faBtn.textContent = "Activer la double authentification";
						setTimeout(() => location.reload(), 800);
					} 
					else {
						if (info) {
							info.style.color = "red";
							info.textContent = data.error || "Erreur lors de la desactivation de la 2FA.";
						}
					}
				};
			} 
			else {
				activate2faBtn.textContent = "Activer la double authentification";
				activate2faBtn.onclick = function () {
					window.location.hash = '2fa-setup';
				};
			}
		}

		// delete account
		if (deleteAccountBtn) {
			deleteAccountBtn.onclick = async function () {
				if (!confirm("Es-tu sûr de vouloir supprimer ton compte? Cette action est irreversible.")) {
					return;
				}
				try {
					const token: string | null = localStorage.getItem('jwt');
					const res: Response = await fetch('/api/delete-account', {
						method: 'POST',
						headers: { 'Authorization': 'Bearer ' + token }
					});
					const data: { success?: boolean; error?: string } = await res.json();
					if (res.ok && data.success) {
						if (info) {
							info.style.color = "green";
							info.textContent = "Compte supprime. Redirection...";
						}
						setTimeout(() => {
							localStorage.removeItem('jwt');
							window.location.hash = 'register';
						}, 1200);
					} else {
						if (info) {
							info.style.color = "red";
							info.textContent = data.error || "Erreur lors de la suppression du compte.";
						}
					}
				} catch (event) {
					if (info) {
						info.style.color = "red";
						info.textContent = "Erreur de connexion serveur.";
					}
				}
			};
		}
	}
}
