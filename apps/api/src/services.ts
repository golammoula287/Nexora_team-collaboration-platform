import type { Auth } from '@nexora/auth';
import type { AnyDatabase } from '@nexora/db';

/**
 * Everything the app needs from the outside world, passed in rather than
 * imported.
 *
 * `createApp(services)` takes these as an argument so the same application can
 * be built against Neon in production and against PGlite in tests. Reaching for
 * a module-level singleton here would make the middleware chain - the part most
 * worth testing - the part hardest to test.
 */
export interface Services {
  db: AnyDatabase;
  auth: Auth;
}
