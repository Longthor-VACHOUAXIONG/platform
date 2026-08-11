import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebaseConfig';

type Zone = {
  id: string;
  zoneName: string;
  baseFarePerKm: { ride: number; electro: number; moto: number; comfort: number; courier: number };
  minimumFare: number;
  currency: string;
};

const RIDE_TYPES = ['ride', 'electro', 'moto', 'comfort', 'courier'] as const;

const EMPTY_ZONE: Omit<Zone, 'id'> = {
  zoneName: '',
  baseFarePerKm: { ride: 3000, electro: 3800, moto: 1800, comfort: 3500, courier: 4000 },
  minimumFare: 10000,
  currency: 'LAK',
};

export default function PricingPage() {
  const { t } = useTranslation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [newZoneId, setNewZoneId] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, 'pricingConfig'), (snap) => {
      setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Zone)));
    });
  }, []);

  const updateZone = (id: string, patch: Partial<Zone>) => {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  };

  const save = async (zone: Zone) => {
    setSaving(zone.id);
    try {
      const { id, ...data } = zone;
      await setDoc(doc(db, 'pricingConfig', id), data);
    } finally {
      setSaving(null);
    }
  };

  const addZone = async () => {
    const id = newZoneId.trim();
    if (!id) return;
    // Refuse to overwrite an existing zone's configured fares — setDoc with
    // the same ID would silently reset the whole zone to defaults.
    const existing = await getDoc(doc(db, 'pricingConfig', id));
    if (existing.exists()) {
      window.alert(`Zone "${id}" already exists — pick a different ID or edit the existing zone.`);
      return;
    }
    await setDoc(doc(db, 'pricingConfig', id), { ...EMPTY_ZONE, zoneName: id });
    setNewZoneId('');
  };

  return (
    <div>
      <header className="page-header">
        <h1>{t('pricing.title')}</h1>
        <p className="muted">{t('pricing.tagline')}</p>
      </header>

      <div className="add-zone-row">
        <input
          placeholder={t('pricing.newZonePlaceholder')}
          value={newZoneId}
          onChange={(e) => setNewZoneId(e.target.value)}
        />
        <button className="btn-primary" onClick={addZone}>
          {t('pricing.addZone')}
        </button>
      </div>

      <div className="card-grid">
        {zones.map((zone) => (
          <div key={zone.id} className="pricing-card">
            <h3>{zone.id}</h3>
            <label>{t('pricing.zoneName')}</label>
            <input
              value={zone.zoneName}
              onChange={(e) => updateZone(zone.id, { zoneName: e.target.value })}
            />

            <label>{t('pricing.minimumFare', { currency: zone.currency })}</label>
            <input
              type="number"
              value={zone.minimumFare}
              onChange={(e) => updateZone(zone.id, { minimumFare: Number(e.target.value) })}
            />

            {RIDE_TYPES.map((key) => (
              <div key={key}>
                <label>{t('pricing.perKm', { rideType: key })}</label>
                <input
                  type="number"
                  value={zone.baseFarePerKm[key]}
                  onChange={(e) =>
                    updateZone(zone.id, {
                      baseFarePerKm: { ...zone.baseFarePerKm, [key]: Number(e.target.value) },
                    })
                  }
                />
              </div>
            ))}

            <button className="btn-primary" disabled={saving === zone.id} onClick={() => save(zone)}>
              {saving === zone.id ? t('pricing.saving') : t('pricing.save')}
            </button>
          </div>
        ))}
        {zones.length === 0 && <p className="empty-cell">{t('pricing.noZonesYet')}</p>}
      </div>
    </div>
  );
}
