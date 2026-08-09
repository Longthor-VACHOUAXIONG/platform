import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebaseConfig';

type Ride = {
  id: string;
  status: string;
  assignedFare: number | null;
  currency: string;
  createdAt: { toDate: () => Date } | null;
};

type Driver = {
  id: string;
  isOnline: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected';
};

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    const ridesQuery = query(
      collection(db, 'rideRequests'),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
    const unsubRides = onSnapshot(ridesQuery, (snap) => {
      setRides(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ride)));
    });
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Driver)));
    });
    return () => {
      unsubRides();
      unsubDrivers();
    };
  }, []);

  const totalRevenue = rides.reduce((sum, r) => sum + (r.assignedFare ?? 0), 0);
  const currency = rides[0]?.currency ?? 'LAK';
  const activeDrivers = drivers.filter((d) => d.isOnline).length;
  const pendingApprovals = drivers.filter((d) => d.verificationStatus === 'pending').length;

  // Bucket completed rides into the last 7 days for the chart.
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({ label: dayLabel(d), count: 0 });
  }
  rides.forEach((r) => {
    const created = r.createdAt?.toDate?.();
    if (!created) return;
    const daysAgo = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo >= 0 && daysAgo < 7) {
      days[6 - daysAgo].count += 1;
    }
  });

  return (
    <div>
      <header className="page-header">
        <h1>{t('analytics.title')}</h1>
        <p className="muted">{t('analytics.tagline')}</p>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="muted">{t('analytics.totalRevenue')}</p>
          <h2>{currency}{totalRevenue.toLocaleString()}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.completedRides')}</p>
          <h2>{rides.length}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.activeDrivers')}</p>
          <h2>{activeDrivers}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.pendingApprovals')}</p>
          <h2>{pendingApprovals}</h2>
        </div>
      </div>

      <div className="chart-card">
        <h3>{t('analytics.ridesLast7Days')}</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#B6F400" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
