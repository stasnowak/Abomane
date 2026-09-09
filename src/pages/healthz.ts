import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';

/**
 * Liveness and readiness in one endpoint.
 *
 * It touches the database rather than just returning 200, so the container's
 * healthcheck fails when the volume is missing or the file is unreadable
 * instead of reporting a server that cannot actually serve anything.
 */
export const GET: APIRoute = () => {
  try {
    getDb().run(sql`select 1`);
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'unknown',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
};
