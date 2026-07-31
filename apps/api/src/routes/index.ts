import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { registerHealthRoutes } from './health.js';
import { registerAuthRoutes } from './auth.js';
import { registerSessionRoutes } from './sessions.js';
import { registerRealtimeTokenRoutes } from './realtime-tokens.js';
import { registerBusinessRoutes } from './business.js';
import { registerAccountRoutes } from './account.js';
import { registerAdminRoutes } from './admin.js';
import { registerDevRoutes } from './dev.js';

export async function registerRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  // Unversioned operational endpoints, for load balancers and uptime checks.
  await registerHealthRoutes(app, context);

  await app.register(
    async (v1) => {
      await registerHealthRoutes(v1, context);
      await registerAuthRoutes(v1, context);
      await registerAccountRoutes(v1, context);
      await registerSessionRoutes(v1, context);
      await registerRealtimeTokenRoutes(v1, context);
      await registerBusinessRoutes(v1, context);
      await registerAdminRoutes(v1, context);
      // Internal organizer simulator. Never mounted in staging or production.
      if (context.derived.devSimulatorEnabled) {
        await registerDevRoutes(v1, context);
      }
    },
    { prefix: '/api/v1' },
  );
}
