// H5 fix: read JWT_SECRET_KEY from backend/.env directly rather than
// keeping a second, independently-edited copy here -- eliminates the drift
// risk where the two services silently disagree on the signing secret.
// Falls back to a local .env (if present) for any backend-node-only vars.
//
// './env' MUST be the first import in this file -- see env.ts's own
// docstring for why (ES module import hoisting bug: a plain loadEnv() call
// placed between import statements does NOT run before those imports are
// evaluated, only before the code textually after it in this file's own
// body runs). Confirmed live: this was silently crashing backend-node on
// every real startup attempt with "JWT_SECRET_KEY is not set" even though
// backend/.env genuinely had it set correctly.
import './env';
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nexyuva-backend' }));
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(`NexYuva backend listening on http://localhost:${PORT}`);
});
