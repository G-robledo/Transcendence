/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rgpdController.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/10 00:36:36 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 00:37:42 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isTokenValid } from "./controllersUtils.js";

export async function rgpdController() {
	if (!(await isTokenValid())) 
		return;
}