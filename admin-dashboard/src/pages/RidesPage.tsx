import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebaseConfig';

type Ride = {
  id: string;
  riderName: string;
  pickup: { label: string };
  destination: { label: string };
  rideTypeId: string;
  requestedFare: number;
  assignedFare: number | null;
  status: string;
  currency: string;
};

const STATUS_FILTERS = [
  'all',
  'searching',
  'offers_received',
  'driver_assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const STATUS_KEY: Record<(typeof STATUS_FILTERS)[number], string> = {
  all: 'statusAll',
  searching: 'statusSearching',
  offers_received: 'statusOffersReceived',
  driver_assigned: 'statusDriverAssigned',
  in_progress: 'statusInProgress',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
};

export default function RidesPage() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');

  useEffect(() => {
    const q = query(collection(db, 'rideRequests'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => {
      setRides(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ride)));
    });
  }, []);

  const visible = filter === 'all' ? rides : rides.filter((r) => r.status === filter);

  return (
    <div>
      <header className="page-header">
        <h1>{t('rides.title')}</h1>
        <p className="muted">{t('rides.shownCount', { count: visible.length })}</p>
      </header>

      <div className="filter-row">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'chip active' : 'chip'} onClick={() => setFilter(s)}>
            {t(`rides.${STATUS_KEY[s]}`)}
          </button>
        ))}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>{t('rides.rider')}</th>
            <th>{t('rides.route')}</th>
            <th>{t('rides.type')}</th>
            <th>{t('rides.fare')}</th>
            <th>{t('rides.status')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id}>
              <td>{r.riderName}</td>
              <td>
                {r.pickup?.label} → {r.destination?.label}
              </td>
              <td>{r.rideTypeId}</td>
              <td>
                {r.currency}
                {(r.assignedFare ?? r.requestedFare)?.toLocaleString()}
              </td>
              <td>
                <span className={`status-badge status-${r.status}`}>
                  {t(`rides.${STATUS_KEY[r.status as (typeof STATUS_FILTERS)[number]] ?? 'statusAll'}`)}
                </span>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-cell">
                {t('rides.noneMatchFilter')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
