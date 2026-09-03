import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export const DEFAULT_DATABASE_PATH = './data/abomane.db';

function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'drizzle');
}

/**
 * Opens a SQLite database and brings it up to the current schema.
 *
 * Migrations run on open rather than as a separate deploy step: the app ships
 * as a single container whose data lives in a volume, so "start the container"
 * has to be the whole upgrade procedure.
 */
export function createDb(path: string, options: { migrations?: boolean } = {}): Db {
  mkdirSync(dirname(resolve(path)), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  if (options.migrations !== false) {
    migrate(db, { migrationsFolder: migrationsFolder() });
  }
  return db;
}

let singleton: Db | null = null;

/** The application-wide database handle. */
export function getDb(): Db {
  if (!singleton) {
    singleton = createDb(process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH);
  }
  return singleton;
}
