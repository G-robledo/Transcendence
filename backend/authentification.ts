/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   authentification.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/18 13:43:07 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:39 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrète_super_complexe';

export async function verifyToken(req: FastifyRequest, reply: FastifyReply) {
	const auth = req.headers.authorization;
	if (!auth || !auth.startsWith('Bearer ')) {
		reply.code(401).send({ error: 'Token requis' });
		return null;
	}
	try {
		const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
		(req as any).user = decoded; // Ajoute à req.user
		return decoded; // Tu peux retourner le payload
	} catch {
		reply.code(401).send({ error: 'Token invalide' });
		return null;
	}
}
