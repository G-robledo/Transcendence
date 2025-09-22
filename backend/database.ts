/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   database.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: grobledo <grobledo@student.42perpignan.    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/06/26 14:09:05 by grobledo          #+#    #+#             */
/*   Updated: 2025/07/11 14:43:46 by grobledo         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// open db or create file if not exist
export const dbPromise = open({
	filename: '/app/data/database.sqlite',
	driver: sqlite3.Database
})

.then(async (db) => {
	await db.exec(`
		CREATE TABLE IF NOT EXISTS players (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			password TEXT NOT NULL,
			game_played INTEGER DEFAULT 0,
			winrate REAL DEFAULT 0,
			game_won INTEGER DEFAULT 0,
			tournaments_played INTEGER DEFAULT 0,
			tournaments_won INTEGER DEFAULT 0,
			secret_key TEXT,
			avatar_url TEXT DEFAULT '/avatars/avatar_default.png'
		);
		CREATE TABLE match_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			player1_id INTEGER NOT NULL,
			player2_id INTEGER NOT NULL,
			score1 INTEGER NOT NULL,
			score2 INTEGER NOT NULL,
			winner_id INTEGER,
			played_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await db.run(`
		INSERT OR IGNORE INTO players (id, username, password)
		VALUES (0, 'bot', '')
	`);
	await db.run(`
	INSERT OR IGNORE INTO players (id, username, password, avatar_url)
	VALUES (1, 'utilisateur supprime', '', '/avatars/deleted.png')
	`);

	await db.run(`
	INSERT OR IGNORE INTO players (id, username, password)
	VALUES (2, 'utilisateur local,', '')
	`);

	console.log(" Base SQLite initialisee");
	return db;
});


