// Loads JWT_SECRET_KEY (and any other shared vars) from backend/.env before
// anything else in this service runs. Split into its own module rather than
// inlined at the top of index.ts -- ES module import statements are hoisted
// and evaluated in dependency order BEFORE any of the importing module's own
// top-level code, even code that appears earlier in the source. index.ts
// used to call loadEnv() as plain code between its import statements, which
// meant `import apiRoutes from './routes'` (which transitively imports
// auth.ts, and auth.ts reads process.env.JWT_SECRET_KEY at module-load time)
// was actually evaluated FIRST, before loadEnv() ever ran -- confirmed via a
// minimal repro (an import evaluated before an inline loadEnv() call that
// textually preceded it). Putting the loadEnv() calls inside a dedicated
// module's own top-level code, and importing that module as literally the
// first import in index.ts, forces it to fully evaluate -- including
// calling loadEnv() -- before index.ts moves on to importing './routes'.
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(__dirname, '../../backend/.env') });
loadEnv();
