import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebaseConfig';

type Driver = {
  id: string;
  name: string;
  phone: string;
  vehicleModel: string;
  plateNumber: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rating: number;
  totalRides: number;
  idPhotoUrl?: string;
  licensePhotoUrl?: string;
  vehiclePhotoUrl?: string;
  selfiePhotoUrl?: string;
};

const TABS = ['pending', 'approved', 'rejected'] as const;
const TAB_KEY: Record<(typeof TABS)[number], string> = {
  pending: 'tabPending',
  approved: 'tabApproved',
  rejected: 'tabRejected',
};

// The four reference photos a driver uploads at sign-up, in the order they
// appear on the card. Missing photos are simply skipped.
const PHOTO_FIELDS: { field: 'idPhotoUrl' | 'licensePhotoUrl' | 'vehiclePhotoUrl' | 'selfiePhotoUrl'; labelKey: string }[] = [
  { field: 'idPhotoUrl', labelKey: 'photoId' },
  { field: 'licensePhotoUrl', labelKey: 'photoLicense' },
  { field: 'vehiclePhotoUrl', labelKey: 'photoVehicle' },
  { field: 'selfiePhotoUrl', labelKey: 'photoSelfie' },
];

export default function DriversPage() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending');

  useEffect(() => {
    const q = query(collection(db, 'drivers'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Driver)));
    });
  }, []);

  const setStatus = async (id: string, status: Driver['verificationStatus']) => {
    try {
      await updateDoc(doc(db, 'drivers', id), { verificationStatus: status });
    } catch (err: any) {
      window.alert(err.message ?? 'Failed to update driver status.');
    }
  };

  const visible = drivers.filter((d) => d.verificationStatus === tab);

  return (
    <div>
      <header className="page-header">
        <h1>{t('drivers.title')}</h1>
        <p className="muted">{t('drivers.tagline')}</p>
      </header>

      <div className="filter-row">
        {TABS.map((tb) => (
          <button key={tb} className={tab === tb ? 'chip active' : 'chip'} onClick={() => setTab(tb)}>
            {t(`drivers.${TAB_KEY[tb]}`)} ({drivers.filter((d) => d.verificationStatus === tb).length})
          </button>
        ))}
      </div>

      <div className="card-grid">
        {visible.map((d) => (
          <div key={d.id} className="driver-card">
            <div className="driver-card-header">
              <strong>{d.name}</strong>
              <span className="muted">★ {d.rating?.toFixed(2) ?? '—'} · {t('drivers.ridesCount', { count: d.totalRides ?? 0 })}</span>
            </div>
            <p className="muted">{d.phone}</p>
            <p>
              {d.vehicleModel} · {d.plateNumber}
            </p>
            {(() => {
              const photos = PHOTO_FIELDS.filter((p) => d[p.field]);
              if (photos.length === 0) return <p className="muted">{t('drivers.noPhotos')}</p>;
              return (
                <div className="photo-grid">
                  {photos.map((p) => (
                    <a
                      key={p.field}
                      className="photo-tile"
                      href={d[p.field]}
                      target="_blank"
                      rel="noreferrer"
                      title={t(`drivers.${p.labelKey}`)}
                    >
                      <img src={d[p.field]} alt={t(`drivers.${p.labelKey}`)} loading="lazy" />
                      <span>{t(`drivers.${p.labelKey}`)}</span>
                    </a>
                  ))}
                </div>
              );
            })()}
            {tab === 'pending' && (
              <div className="action-row">
                <button className="btn-primary" onClick={() => setStatus(d.id, 'approved')}>
                  {t('drivers.approve')}
                </button>
                <button className="btn-secondary" onClick={() => setStatus(d.id, 'rejected')}>
                  {t('drivers.reject')}
                </button>
              </div>
            )}
            {tab === 'rejected' && (
              <button className="btn-secondary" onClick={() => setStatus(d.id, 'pending')}>
                {t('drivers.moveBackToPending')}
              </button>
            )}
            {tab === 'approved' && (
              <button className="btn-secondary" onClick={() => setStatus(d.id, 'rejected')}>
                {t('drivers.revokeApproval')}
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="empty-cell">{t('drivers.noneInTab', { tab: t(`drivers.${TAB_KEY[tab]}`) })}</p>}
      </div>
    </div>
  );
}
