import express from 'express';
import * as Sentry from '@sentry/node';
import { expressIntegration, setupExpressErrorHandler } from '@sentry/node';
import { registerPushToken, registerRiderPushToken, submitOffer, acceptOffer, cancelRide, startTrip, completeTrip } from './rideLifecycle';
import { setAdminRole } from './admin';
import { getRecommendedFare } from './pricing';
import { submitRating } from './ratings';
import { requestRide } from './rideMatching';
import { sendChatMessage } from './chat';
import { setOnlineStatus, requestTopUp, reviewTopUp, initiateBcelTopUp, bcelWebhook } from './wallet';

// Standalone server that serves the same business logic as the Firebase
// Cloud Functions, for running on a plain host (e.g. the gofair VPS) instead
// of Google Cloud Functions.
//
// firebase-functions v2 `onCall`/`onRequest` handlers are Express (req, res)
// handlers: they verify the caller's Firebase ID token from the Authorization
// header themselves (via firebase-admin), decode the `{data}` envelope, run
// the handler, and write back `{result}` / `{error}` with the correct status.
// So we just mount each one at `/<name>` and the mobile/web SDKs' callable
// protocol works unchanged.
//
// Requires the same env as the Cloud Functions runtime:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   GCLOUD_PROJECT=<firebase-project-id>

const app = express();

// Sentry error tracking — enabled only when SENTRY_DSN is set (e.g. in
// infra/deploy/.env). Without a DSN these middlewares are no-ops.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'production',
  tracesSampleRate: 0.1,
  integrations: [expressIntegration()],
});

app.use(express.json({ limit: '1mb' }));

const callables: Record<string, unknown> = {
  requestRide,
  sendChatMessage,
  registerPushToken,
  registerRiderPushToken,
  submitOffer,
  acceptOffer,
  cancelRide,
  startTrip,
  completeTrip,
  setAdminRole,
  getRecommendedFare,
  submitRating,
  setOnlineStatus,
  requestTopUp,
  reviewTopUp,
  initiateBcelTopUp,
};

// The firebase-functions v2 TS types describe a `CallableFunction` object,
// but at runtime `onCall` returns an Express (req, res) handler (it does the
// CORS + ID-token verification + envelope decode/encode itself). Cast to the
// express handler type so we can mount it directly.
for (const [name, handler] of Object.entries(callables)) {
  app.use(`/${name}`, handler as express.RequestHandler);
}

app.post('/bcelWebhook', bcelWebhook as unknown as express.RequestHandler);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Must be the last middleware — reports any error thrown by handlers above.
setupExpressErrorHandler(app);

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`gofair backend listening on :${PORT}`);
});
