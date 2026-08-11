import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { db, functions } from '../lib/firebaseConfig';

type RideStats = {
  completedRides?: number;
  grossRevenueKip?: number;
  commissionKip?: number;
  byRideType?: Record<string, { completedRides?: number; grossRevenueKip?: number; commissionKip?: number }>;
  recomputedAt?: { toDate: () => Date };
};

type WalletStats = {
  topUpCount?: number;
  topUpApprovedKip?: number;
};

type DayStats = {
  completedRides?: number;
  grossRevenueKip?: number;
  commissionKip?: number;
};

type Driver = {
  id: string;
  isOnline: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected';
};

const RIDE_TYPE_ORDER = ['ride', 'electro', 'moto', 'comfort'];

const recomputeStatsFn = httpsCallable<Record<string, never>, { ok: boolean }>(functions, 'recomputeAdminStats');

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<RideStats | null>(null);
  const [wallets, setWallets] = useState<WalletStats | null>(null);
  const [days, setDays] = useState<{ key: string; stats: DayStats }[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    const unsubRides = onSnapshot(doc(db, 'adminStats', 'rides'), (snap) => {
      setRides(snap.exists() ? (snap.data() as RideStats) : null);
    });
    const unsubWallets = onSnapshot(doc(db, 'adminStats', 'wallets'), (snap) => {
      setWallets(snap.exists() ? (snap.data() as WalletStats) : null);
    });
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Driver)));
    });

    // Daily buckets for the chart. The backend keys these by the business's
    // local calendar day (Asia/Vientiane), so no timezone math is needed here.
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dayKeys.push(`${year}-${month}-${day}`);
    }
    const unsubs = dayKeys.map((key) =>
      onSnapshot(doc(db, 'adminStatsDaily', key), (snap) => {
        setDays((prev) => {
          const stats = snap.exists() ? (snap.data() as DayStats) : { completedRides: 0, grossRevenueKip: 0, commissionKip: 0 };
          return prev.some((d) => d.key === key)
            ? prev.map((d) => (d.key === key ? { key, stats } : d))
            : [...prev, { key, stats }];
        });
      })
    );

    return () => {
      unsubRides();
      unsubWallets();
      unsubDrivers();
      unsubs.forEach((u) => u());
    };
  }, []);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const res = await recomputeStatsFn({});
      const { ok, truncated } = res.data as { ok: boolean; truncated: boolean };
      if (ok && truncated) {
        window.alert(t('analytics.recomputeTruncated'));
      }
    } catch (err: any) {
      window.alert(err.message ?? t('analytics.recomputeFailed'));
    } finally {
      setRecomputing(false);
    }
  };

  const currency = 'LAK';
  const activeDrivers = drivers.filter((d) => d.isOnline).length;
  const pendingApprovals = drivers.filter((d) => d.verificationStatus === 'pending').length;

  const chartDays = [...days]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, stats }) => ({
      label: dayLabel(new Date(`${key}T12:00:00`)),
      count: stats.completedRides ?? 0,
    }));

  const hasStats = rides != null || wallets != null;

  return (
    <div>
      <header className="page-header">
        <h1>{t('analytics.title')}</h1>
        <p className="muted">{t('analytics.tagline')}</p>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="muted">{t('analytics.commissionRevenue')}</p>
          <h2>{currency}{(rides?.commissionKip ?? 0).toLocaleString()}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.completedRides')}</p>
          <h2>{(rides?.completedRides ?? 0).toLocaleString()}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.grossVolume')}</p>
          <h2>{currency}{(rides?.grossRevenueKip ?? 0).toLocaleString()}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.topUpVolume')}</p>
          <h2>{currency}{(wallets?.topUpApprovedKip ?? 0).toLocaleString()}</h2>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="muted">{t('analytics.activeDrivers')}</p>
          <h2>{activeDrivers}</h2>
        </div>
        <div className="stat-card">
          <p className="muted">{t('analytics.pendingApprovals')}</p>
          <h2>{pendingApprovals}</h2>
        </div>
      </div>

      {!hasStats && (
        <div className="chart-card">
          <h3>{t('analytics.noStatsYet')}</h3>
          <p className="muted" style={{ marginBottom: 12 }}>{t('analytics.noStatsHint')}</p>
          <button className="btn-primary" disabled={recomputing} onClick={recompute}>
            {recomputing ? t('analytics.recomputing') : t('analytics.recompute')}
          </button>
        </div>
      )}

      {rides?.byRideType && Object.keys(rides.byRideType).length > 0 && (
        <div className="chart-card">
          <h3>{t('analytics.byRideType')}</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('analytics.rideType')}</th>
                <th>{t('analytics.completedRides')}</th>
                <th>{t('analytics.grossVolume')}</th>
                <th>{t('analytics.commissionRevenue')}</th>
              </tr>
            </thead>
            <tbody>
              {RIDE_TYPE_ORDER.filter((rt) => rides.byRideType?.[rt]).map((rt) => {
                const s = rides.byRideType![rt];
                return (
                  <tr key={rt}>
                    <td>{t(`analytics.rideTypes.${rt}`)}</td>
                    <td>{s.completedRides ?? 0}</td>
                    <td>{currency}{(s.grossRevenueKip ?? 0).toLocaleString()}</td>
                    <td>{currency}{(s.commissionKip ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="chart-card">
        <h3>{t('analytics.ridesLast7Days')}</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartDays}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#B6F400" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {hasStats && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-secondary" disabled={recomputing} onClick={recompute}>
            {recomputing ? t('analytics.recomputing') : t('analytics.recompute')}
          </button>
        </div>
      )}
    </div>
  );
}
