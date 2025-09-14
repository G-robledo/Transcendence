/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   routeshtml.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:08:36 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 11:32:51 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { loginController } from "./controllers/loginController.js";
import { registerController } from "./controllers/registerController.js";
import { homeController } from "./controllers/homeController.js";
import { dashboardController } from "./controllers/dashboardController.js";
import { profileController } from "./controllers/profileController.js";
import { gameController } from "./controllers/gameController.js";
import { twoFaSetupController } from "./controllers/2faController.js";
import { tournamentController } from "./controllers/tournamentController.js";
import { rgpdController } from "./controllers/rgpdController.js";

// ggestion de toute les routes avec html associe et controller de chaque page
export const routes = {
	'login': { html: '/pages/login.html', controller: loginController },
	'register': { html: '/pages/register.html', controller: registerController },
	'home': { html: '/pages/home.html', controller: homeController },
	'history': { html: '/pages/dashboard.html', controller: dashboardController },
	'profile': { html: '/pages/profile.html', controller: profileController },
	'game': { html: '/pages/game.html', controller: gameController },
	"2fa-setup": { html: "/pages/2fa-setup.html", controller: twoFaSetupController },
	'tournament': {html: "/pages/tournament.html", controller: tournamentController},
	'rgpd': {html:"/pages/rgpd.html", controller: rgpdController}
};

(window as any).routes = routes;