/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:09:31 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:51 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import Fastify from 'fastify';
import path from 'path';
import fs from 'fs';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import routes from './routes';
import { gameWebSocket } from './wsHandler.js';
import './database';
import { startGameLoop } from './gameLoop.js';
import { tournamentWebSocket } from './tournament.js';
import fastifyMultipart from '@fastify/multipart';



async function startServer() {
	const fastify = Fastify({
		https: {
			key: fs.readFileSync('./cert/server.key'),
			cert: fs.readFileSync('./cert/server.crt'),
		},
		logger: true,
	});

	await fastify.register(fastifyMultipart);
	await fastify.register(fastifyWebsocket); // enable webSocket support in fastify

	await gameWebSocket(fastify);
	await tournamentWebSocket(fastify);

	startGameLoop();

	fastify.register(fastifyStatic, {
	root: path.join(__dirname, '../../public'),
	prefix: '/',
	});

	fastify.register(fastifyStatic, {
	root: path.join(__dirname, '../../public/avatars'),
	prefix: '/avatars/',
	decorateReply: false // empeche plugin d'ajouter quelque chose a la requete http
});

	routes(fastify); // enregistre toutes les routes API

	fastify.listen({ port: 8443, host: '0.0.0.0' }, err => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	console.log(`Serveur lance`)
	});


	const shutdown = async () => {
		console.log('Arrêt du serveur...');
		await fastify.close();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);   // Ctrl+C ou docker stop
	process.on('SIGTERM', shutdown);  // docker stop standard
}

startServer().catch(err => {
	console.error('echec du lancement du serveur :', err);
	process.exit(1);
});