import * as Sentry from '@sentry/node';

// Error tracking for the Cloud Functions path (the VPS runtime inits Sentry
// in server.ts). Enabled only when SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'production',
  tracesSampleRate: 0.1,
});

export { onRideRequestCreated, requestRide } from './rideMatching';
export { recomputeAdminStats } from './analytics';
export {
  submitOffer,
  acceptOffer,
  cancelRide,
  startTrip,
  completeTrip,
  registerPushToken,
  registerRiderPushToken,
} from './rideLifecycle';
export { setAdminRole } from './admin';
export { getRecommendedFare } from './pricing';
export { submitRating } from './ratings';
export { onChatMessageCreated, sendChatMessage } from './chat';
export { setOnlineStatus, requestTopUp, reviewTopUp, initiateBcelTopUp, bcelWebhook } from './wallet';
