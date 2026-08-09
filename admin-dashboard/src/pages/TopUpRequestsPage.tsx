import { useEffect, useState } from 'react';
import { collectionGroup, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { db, functions } from '../lib/firebaseConfig';

type PendingTopUp = {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  proofImageUrl: string | null;
  createdAt: { toDate: () => Date } | null;
};

const reviewTopUpFn = httpsCallable<
  { driverId: string; transactionId: string; approve: boolean },
  { ok: boolean }
>(functions, 'reviewTopUp');

export default function TopUpRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<PendingTopUp[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    // Collection-group query across every driver's walletTransactions
    // subcollection — see firestore.indexes.json for the required index.
    const q = query(
      collectionGroup(db, 'walletTransactions'),
      where('status', '==', 'pending'),
      where('type', '==', 'topup'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, async (snap) => {
      const rows = await Promise.all(
        snap.docs.map(async (d) => {
          const driverId = d.ref.parent.parent!.id;
          const driverSnap = await getDoc(doc(db, 'drivers', driverId));
          return {
            id: d.id,
            driverId,
            driverName: driverSnap.data()?.name ?? driverId,
            amount: d.data().amount,
            proofImageUrl: d.data().proofImageUrl ?? null,
            createdAt: d.data().createdAt ?? null,
          } as PendingTopUp;
        })
      );
      setRequests(rows);
    });
  }, []);

  const review = async (req: PendingTopUp, approve: boolean) => {
    setBusyId(req.id);
    try {
      await reviewTopUpFn({ driverId: req.driverId, transactionId: req.id, approve });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1>{t('topups.title')}</h1>
        <p className="muted">{t('topups.tagline')}</p>
      </header>

      <div className="card-grid">
        {requests.map((req) => (
          <div key={req.id} className="driver-card">
            <div className="driver-card-header">
              <strong>{req.driverName}</strong>
              <span className="muted">
                {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString() : ''}
              </span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '8px 0' }}>{req.amount.toLocaleString()}</p>
            {req.proofImageUrl && (
              <a href={req.proofImageUrl} target="_blank" rel="noreferrer">
                <img
                  src={req.proofImageUrl}
                  alt="Payment proof"
                  style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                />
              </a>
            )}
            <div className="action-row">
              <button className="btn-primary" disabled={busyId === req.id} onClick={() => review(req, true)}>
                {t('topups.approve')}
              </button>
              <button className="btn-secondary" disabled={busyId === req.id} onClick={() => review(req, false)}>
                {t('topups.reject')}
              </button>
            </div>
          </div>
        ))}
        {requests.length === 0 && <p className="empty-cell">{t('topups.none')}</p>}
      </div>
    </div>
  );
}
