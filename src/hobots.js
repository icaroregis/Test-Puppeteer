import { hostname } from 'node:os';
import * as Hobots from 'hobots';

export function initHobots(env = process.env) {
  const clientSecret = env.HOBOTS_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new Error('Configure HOBOTS_CLIENT_SECRET no .env e execute pnpm start.');
  }

  Hobots.init({
    clientSecret,
    environment: env.HOBOTS_ENVIRONMENT?.trim(),
    release: env.HOBOTS_RELEASE?.trim(),
    instanceId: env.HOBOTS_INSTANCE_ID?.trim() || hostname(),
    heartbeat: true,
    tasks: true,
  });
}
