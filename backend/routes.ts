/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   routes.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:09:21 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/10 14:48:51 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbPromise } from './database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import type { MultipartFile } from '@fastify/multipart';
import sharp from 'sharp';
import { verifyToken } from './authentification.js';

const userPings = new Map<string, number>();
const connectedUsers = new Set<string>();
let userPingsCleanupStarted = false;


declare module 'fastify' {
	interface FastifyInstance {
		userPings?: Map<string, number>;
	}
}

// typage pour body json pour 2fa
type Verify2FABody = {code: string;secret: string;userId: number;};


export default async function routes(fastify: FastifyInstance) {


// ================ Creation user ======================
	fastify.post('/api/users', async (request, reply) => {
		const { username, password } = request.body as {
			username?: string;
			password?: string;
		};

		if (!username || !password)
			return reply.code(400).send({ error: 'Champs requis' });
		
		if (password.length < 4) {
			return reply.code(400).send({ error: "Le mot de passe est trop court." });
		}


		const db = await dbPromise;
		const user = await db.get('SELECT id FROM players WHERE username = ?', username);
		if (user) {
			return reply.code(409).send({ error: 'User already exist' });
		}

		const hash = await bcrypt.hash(password, 10);
		await db.run('INSERT INTO players (username, password) VALUES (?, ?)', username, hash);
		reply.code(201).send({ success: true });
	});

	

// ================ LOGIN =====================
	fastify.post('/api/login', async (request, reply) => {
		const { username, password } = request.body as {
			username?: string;
			password?: string;
		};
		const JWT_SECRET = process.env.JWT_SECRET!;

		if (!username || !password) {
			return reply.code(400).send({ error: 'Champs requis' });
		}

		// Verifie si ce user est dejà connecte 
		if (connectedUsers.has(username)) {
			return reply.code(409).send({ error: 'Ce compte est dejà connecte ailleurs.' });
		}

		const db = await dbPromise;
		const user = await db.get('SELECT id, password, secret_key FROM players WHERE username = ?', username);

		if (!user) return reply.code(401).send({ error: 'Utilisateur introuvable' });

		const isValid = await bcrypt.compare(password, user.password);
		if (!isValid) return reply.code(401).send({ error: 'Mot de passe incorrect' });

		// Verifie si la 2FA est activee
		if (user.secret_key) {
			// Mot de passe OK mais demande 2FA
			return reply.send({ success: false, require2fa: true, userId: user.id});
		}

		// Sinon, login classique
		const token = jwt.sign(
			{ userId: user.id, username },
			JWT_SECRET,
			{ expiresIn: '1h' }
		);

		connectedUsers.add(username); // ajoute username a la liste

		return reply.send({ success: true, token });
	});

// ==================== Login avec 2fa ================

	fastify.post('/api/login2fa', async (request, reply) => {
		const { userId, code } = request.body as { userId?: number, code?: string };
		const JWT_SECRET = process.env.JWT_SECRET!;

		if (!userId || !code) {
			return reply.code(400).send({ error: 'Champs requis' });
		}

		const db = await dbPromise;
		const user = await db.get('SELECT username, secret_key FROM players WHERE id = ?', userId);

		if (!user || !user.secret_key) {
			return reply.code(401).send({ error: 'Utilisateur ou secret 2FA introuvable' });
		}

		// Verification du code TOTP
		const verified = speakeasy.totp.verify({
			secret: user.secret_key,
			encoding: 'base32',
			token: code
		});

		if (!verified) {
			return reply.code(401).send({ error: 'Code 2FA invalide' });
		}

		// Genère et envoie le token JWT
		const token = jwt.sign(
			{ userId, username: user.username },
			JWT_SECRET,
			{ expiresIn: '1h' }
		);

		// Marque ce user comme connecte
		connectedUsers.add(user.username);

		return reply.send({ success: true, token });
	});

// ========================= check JWT + 2fa =====================




	fastify.get('/api/me', async (request, reply) => {

		const auth = request.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ error: 'Aucun token' });
		} // check le JWT pour voir si il est valide
		const token = auth.substring('Bearer '.length); // on degage le bearer
		const JWT_SECRET = process.env.JWT_SECRET!; // on recup la cle secrete du JWT

		let payload: { userId: number; username: string };
		try {
			payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
		} 
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId; // si tout est bon on recup les infos

		const db = await dbPromise;
		const user = await db.get('SELECT username, avatar_url, secret_key FROM players WHERE id = ?', userId);
		if (!user) {
			return reply.code(404).send({ error: "Utilisateur introuvable." });
		}
		reply.send({userId, username: user.username, avatarUrl: user.avatar_url, has2fa: !!user.secret_key });
	});


// =================================== logout =======================

	fastify.post('/api/logout', async (request, reply) => {
		const payload = await verifyToken(request, reply);
			if (!payload) return;
		// Retire l'utilisateur du set connecte (on utilise le username stocke dans le token)
		if (payload && typeof payload === 'object' && 'username' in payload && typeof payload.username === 'string') {
			connectedUsers.delete(payload.username);
		}
		reply.send({ success: true });
	});

// ============================ activation 2fa =====================

	fastify.post('/api/2fasetup', async (req, reply) => {
		try {
			// Genère le secret 2FA
			const secret = speakeasy.generateSecret({ name: 'ft_transcendence' });

			// Verifie que l’otpauth_url existe
			if (!secret.otpauth_url) {
				console.error("[2FA Setup] otpauth_url manquante dans le secret genere:", secret);
				reply.code(500).send({ success: false, error: "Impossible de generer l'URL OTPAuth" });
				return;
			}

			// Genère le QR code à partir de l’otpauth_url
			const qr = await qrcode.toDataURL(secret.otpauth_url);

			console.log("[2FA Setup] Reponse envoyee au client :", { qr: qr.slice(0, 32) + "...", secret: secret.base32 }); // Le qr en entier serait trop long

			reply.send({
				success: true,
				qr,		// à afficher avec <img src="qr" />
				secret: secret.base32
			});
		} 
		catch (err) {
			console.error("[2FA Setup] Erreur:", err);
			reply.code(500).send({ success: false, error: "Erreur serveur lors de la generation du QR code" });
		}
	});

// ========================== verify 2fa ==========================
	fastify.post<{ Body: Verify2FABody }>('/api/verify2fa', async (req, res) => {

		const { code, secret } = req.body;
		console.log("[2FA Verify] Payload reçu du client:", req.body);

		const auth = req.headers.authorization;
		if (!auth || !auth.startsWith('Bearer ')) {
			console.error("[2FA Verify] Token manquant dans l'entête");
			return res.code(401).send({ success: false, error: "Token manquant" });
		}

		let userId: number;
		try {
			const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: number, username: string };
			userId = payload.userId;
			console.log("[2FA Verify] userId extrait du token :", userId); // on check l'id du token
		} 
		catch (event) {
			console.error("[2FA Verify] Erreur lors du decodage du token :", event);
			return res.code(401).send({ success: false, error: "Token invalide" });
		}

		const verified = speakeasy.totp.verify({ secret: secret, encoding: 'base32', token: code}); // verif du TOTP

		console.log("[2FA Verify] Resultat verification TOTP :", verified);

		if (verified) {
			const db = await dbPromise;
			await db.run("UPDATE players SET secret_key = ? WHERE id = ?", [secret, userId]);
			console.log(`[2FA Verify] Secret stocke pour userId=${userId}`);
			return res.send({ success: true });
		}
		else {
			console.log("[2FA Verify] Code TOTP invalide");
			return res.send({ success: false, error: "Code invalide" });
		}
	});


	// ==================check du ping ================
	fastify.get('/api/ping', async (request, reply) => {
		const auth = request.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ error: 'Aucun token' });
		}
		const token = auth.substring('Bearer '.length);
		const JWT_SECRET = process.env.JWT_SECRET!;

		let payload: { userId: number; username: string };
		try {
			payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
		} 
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}

		// Ici, on note le timestamp du dernier ping pour ce user (dans un Map)
		userPings.set(payload.username, Date.now());

		connectedUsers.add(payload.username);

		reply.send({ message: 'pong', now: Date.now() });
	});


// =================== Desactivation 2FA =========================
	fastify.post('/api/disable-2fa', async (req, reply) => {
		const auth = req.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ success: false, error: 'Aucun token' });
		}
		const token = auth.substring('Bearer '.length);
		const JWT_SECRET = process.env.JWT_SECRET!;
		let payload: { userId: number; username: string };
		try {
			payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
		} catch {
			return reply.code(401).send({ success: false, error: 'Token invalide' });
		}
		const userId = payload.userId;

		const db = await dbPromise;
		// Mets à NULL la cle secrète
		await db.run('UPDATE players SET secret_key = NULL WHERE id = ?', userId);

		reply.send({ success: true });
	});


// ======================== modifier pseudo =======================
	fastify.post('/api/change-username', async (request, reply) => {
		const auth = request.headers.authorization || '';
		const token = auth.replace('Bearer ', '');
		let payload: any;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET!);
		}
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}

		const userId = payload.userId;
		const oldUsername = payload.username;
		const { newUsername } = request.body as { newUsername?: string };

		if (!newUsername || typeof newUsername !== 'string' || newUsername.trim().length < 2) {
			return reply.code(400).send({ error: "Nouveau pseudo invalide." });
		}

		const db = await dbPromise;
		const already = await db.get('SELECT id FROM players WHERE username = ?', newUsername);
		if (already) {
			return reply.code(409).send({ error: "Pseudo dejà utilise." });
		}
		await db.run('UPDATE players SET username = ? WHERE id = ?', newUsername, userId);

		// Mets à jour dans le set des users connectes
		connectedUsers.delete(oldUsername);
		connectedUsers.add(newUsername);

		// genère un nouveau token avec le nouveau username
		const JWT_SECRET = process.env.JWT_SECRET!;
		const newToken = jwt.sign(
			{ userId: userId, username: newUsername },
			JWT_SECRET,
			{ expiresIn: '1h' }
		);

		reply.send({ success: true, newUsername, token: newToken });
	});


// =============================== modifier mdp ===========================
	fastify.post('/api/change-password', async (request, reply) => {
		const auth = request.headers.authorization || '';
		const token = auth.replace('Bearer ', '');
		let payload: any;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET!);
		}
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId;
		const { oldPassword, newPassword } = request.body as { oldPassword?: string; newPassword?: string };

		if (!oldPassword || !newPassword) {
			return reply.code(400).send({ error: "Tous les champs sont requis." });
		}
		if (newPassword.length < 4) {
			return reply.code(400).send({ error: "Le nouveau mot de passe est trop court." });
		}

		const db = await dbPromise;
		const user = await db.get('SELECT password FROM players WHERE id = ?', userId);
		if (!user) {
			return reply.code(404).send({ error: "Utilisateur introuvable." });
		}
		const isValid = await bcrypt.compare(oldPassword, user.password);
		if (!isValid) {
			return reply.code(401).send({ error: "Ancien mot de passe incorrect." });
		}
		const hash = await bcrypt.hash(newPassword, 10);
		await db.run('UPDATE players SET password = ? WHERE id = ?', hash, userId);

		reply.send({ success: true });
	});

// ========================= delete dans database =========================
	fastify.post('/api/delete-account', async (request, reply) => {
		const auth = request.headers.authorization || '';
		const token = auth.replace('Bearer ', '');
		let payload: any;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET!);
		}
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId;
		const db = await dbPromise;

		// Met à jour l'historique pour remplacer le userId par 1 (utilisateur supprime)
		await db.run('UPDATE match_history SET player1_id = 1 WHERE player1_id = ?', userId);
		await db.run('UPDATE match_history SET player2_id = 1 WHERE player2_id = ?', userId);
		await db.run('UPDATE match_history SET winner_id = 1 WHERE winner_id = ?', userId);

		// Supprime le joueur
		await db.run('DELETE FROM players WHERE id = ?', userId);
		connectedUsers.delete(payload.username);

		reply.send({ success: true });
	});


// ====================== get info dashboard =====================
	fastify.get('/api/dashboard', async (request, reply) => {
		const auth = request.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ error: 'Aucun token' });
		}
		const token = auth.substring('Bearer '.length);
		const JWT_SECRET = process.env.JWT_SECRET!;

		let payload: any;
		try {
			payload = jwt.verify(token, JWT_SECRET);
		} 
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId;

		const db = await dbPromise;
		const stats = await db.get(`
			SELECT
				game_won as win,
				winrate,
				game_played,
				tournaments_played,
				tournaments_won
			FROM players WHERE id = ?
		`, userId); // get toutes les infos dans la db pour le dashboard

		reply.send(stats || {});
	});

// ========================== get info historique ====================
	type MatchHistoryRow = {
		id: number;
		played_at: string;
		player1: string;
		player2: string;
		score1: number;
		score2: number;
		winner_id: number | null;
	};

	type MatchHistoryResponse = {
		id: number;
		played_at: string;
		opponent: string;
		score1: number;
		score2: number;
		result: "win" | "lose" | "draw";
	}[];

	fastify.get('/api/history', async (request: FastifyRequest, reply: FastifyReply) => {
		const auth = request.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ error: 'Aucun token' });
		}
		const token = auth.substring('Bearer '.length);
		const JWT_SECRET = process.env.JWT_SECRET!;

		let payload: any;
		try {
			payload = jwt.verify(token, JWT_SECRET);
		} 
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId;
		const username = payload.username;

		const db = await dbPromise;
		const rows: MatchHistoryRow[] = await db.all(`
			SELECT
				mh.id,
				mh.played_at,
				p1.username as player1,
				p2.username as player2,
				mh.score1,
				mh.score2,
				mh.winner_id
			FROM match_history mh
			LEFT JOIN players p1 ON mh.player1_id = p1.id
			LEFT JOIN players p2 ON mh.player2_id = p2.id
			WHERE mh.player1_id = ? OR mh.player2_id = ?
			ORDER BY mh.played_at DESC
			LIMIT 30
		`, userId, userId);

		const history: MatchHistoryResponse = [];

		for (const row of rows) {
			let score1: number;
			let score2: number;
			let opponent: string;
			let result: "win" | "lose"

			// Score et adversaire
			if (row.player1 === username) {
				score1 = row.score1;
				score2 = row.score2;
				opponent = row.player2 || "bot";
			} 
			else {
				score1 = row.score2;
				score2 = row.score1;
				opponent = row.player1 || "bot";
			}

			// Resultat
			if (row.winner_id === userId) {
				result = "win";
			} 
			else {
				result = "lose";
			}

			history.push({
				id: row.id,
				played_at: row.played_at,
				opponent,
				score1,
				score2,
				result
			});
		}

		reply.send(history);
	});

// ============ upload avatar ==========

	fastify.post('/api/upload-avatar', async (request, reply) => {
		const auth = request.headers['authorization'];
		if (!auth || !auth.startsWith('Bearer ')) {
			return reply.code(401).send({ error: 'Aucun token' });
		}
		const token = auth.substring('Bearer '.length);
		const JWT_SECRET = process.env.JWT_SECRET!;

		let payload: any;
		try {
			payload = jwt.verify(token, JWT_SECRET);
		} 
		catch {
			return reply.code(401).send({ error: 'Token invalide' });
		}
		const userId = payload.userId;

		const parts = request.parts();
		let filePart: MultipartFile | null = null;

		for await (const part of parts) {
			if ("file" in part && part.fieldname === "avatar") {
				filePart = part as MultipartFile;
				break;
			}
		} // on recup le fichier envoye par le client

		if (!filePart) {
			return reply.code(400).send({ error: 'Aucun fichier envoye.' });
		}

		const ext = path.extname(filePart.filename).toLowerCase();
		if ( ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg' && ext !== '.webp') {
			return reply.code(400).send({ error: 'Format de fichier non supporte' });
		}

		// 1. Cherche ancien avatar et supprime-le si besoin (sauf si c'est l'avatar par defaut)
		const db = await dbPromise;
		const user = await db.get('SELECT avatar_url FROM players WHERE id = ?', userId);
		if (user && user.avatar_url) {
			if (user.avatar_url !== '/avatars/avatar_default.png') {
				let oldFileName: string;
				if (user.avatar_url.startsWith('/avatars/')) {
					oldFileName = user.avatar_url.slice('/avatars/'.length);
				} 
				else {
					oldFileName = user.avatar_url;
				}
				const oldAvatarPath = path.join(__dirname, '../../public/avatars', oldFileName);
				try {
					await fs.unlink(oldAvatarPath);
				} 
				catch (event) {
				}
			}
		}

		// 2. Cree un nom unique en .webp
		const fileName = `avatar_${userId}_${Date.now()}.webp`;
		const uploadPath = path.join(__dirname, '../../public/avatars', fileName);

		// 3. Utilise sharp pour redimensionner et convertir l'image en webp
		await fs.mkdir(path.dirname(uploadPath), { recursive: true });

		const chunks: Buffer[] = [];
		for await (const chunk of filePart.file) {
			chunks.push(chunk);
		}
		const fileBuffer = Buffer.concat(chunks);

		const resizedBuffer = await sharp(fileBuffer)
			.resize(256, 256, { fit: 'cover' })    // redimensionne à 256x256px
			.webp({ quality: 80 })                 // convertit en .webp qualite 80% economise place
			.toBuffer();

		await fs.writeFile(uploadPath, resizedBuffer); // on met l'avatar dans le bon dossier

		// 4. Mets à jour la db (champ avatar_url)
		await db.run(
			'UPDATE players SET avatar_url = ? WHERE id = ?',
			`/avatars/${fileName}`,
			userId
		);

		reply.send({ success: true, avatarUrl: `/avatars/${fileName}` });
	});

	// ==================== autre profile ============================

	fastify.get('/api/profile/:username', async (request, reply) => {
		const { username } = request.params as { username: string };
		const db = await dbPromise;
		const user = await db.get(
			'SELECT id, username, avatar_url FROM players WHERE username = ?', 
			username
		);
		if (!user) return reply.code(404).send({ error: "Utilisateur introuvable" });

		reply.send({
			userId: user.id,
			username: user.username,
			avatarUrl: user.avatar_url
		});
	});
}

// ================== fonvction de clean d'user ==================

// Nettoyage regulier des users inactifs
if (!userPingsCleanupStarted) {
	userPingsCleanupStarted = true; // Anti-multi-setup sur reload/hot

	setInterval(() => {
		const TIMER = 120000; // check toutes les 2 minutes
		const now = Date.now();
		for (const [username, lastPing] of userPings.entries()) {
			if (now - lastPing > TIMER) {
				connectedUsers.delete(username);
				userPings.delete(username);
				console.log(`[CLEANUP][PING] User ${username} retire des connectes (inactif)`);
			}
		}
	}, 60000); // 1 min
}