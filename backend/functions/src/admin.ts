import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';

/**
 * Grants the `admin` custom claim to a user. Only an existing admin can call
 * this — so you MUST bootstrap your first admin manually (see
 * scripts/bootstrap-admin.ts) before this function is useful.
 */
export const setAdminRole = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const callerToken = request.auth?.token;
  if (!callerToken?.admin) {
    throw new HttpsError('permission-denied', 'Only an admin can grant admin access.');
  }

  const { targetUid, isAdmin } = request.data as { targetUid: string; isAdmin: boolean };
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');

  await getAuth().setCustomUserClaims(targetUid, { admin: !!isAdmin });
  return { ok: true };
});
