/**
 * Applies pending migrations, then exits.
 *
 * Plain JavaScript on purpose: the container runs this before the server so a
 * broken upgrade fails loudly at startup, and that path must not depend on a
 * TypeScript loader or on the built application bundle.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const path = process.env.DATABASE_PATH ?? './data/abomane.db';
const migrationsFolder = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'drizzle');

mkdirSync(dirname(resolve(path)), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

migrate(drizzle(sqlite), { migrationsFolder });
sqlite.close();

console.log(`[abomane] migrations applied to ${path}`);
