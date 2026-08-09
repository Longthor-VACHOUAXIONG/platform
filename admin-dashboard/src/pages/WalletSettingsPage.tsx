import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { db, storage } from '../lib/firebaseConfig';

type WalletConfig = {
  commissionRate: number;
  minimumBalance: number;
  currency: string;
  topUpMode: 'manual' | 'auto';
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankQrImageUrl: string | null;
};

type BcelCreds = {
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
};

const EMPTY_CONFIG: WalletConfig = {
  commissionRate: 0.1,
  minimumBalance: 50000,
  currency: 'LAK',
  topUpMode: 'manual',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankQrImageUrl: null,
};

const EMPTY_CREDS: BcelCreds = { merchantId: '', apiKey: '', apiSecret: '', webhookSecret: '' };

export default function WalletSettingsPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<WalletConfig>(EMPTY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creds, setCreds] = useState<BcelCreds>(EMPTY_CREDS);
  const [savingCreds, setSavingCreds] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, 'walletConfig', 'default'), (snap) => {
      if (snap.exists()) setConfig(snap.data() as WalletConfig);
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'secureConfig', 'bcel'), (snap) => {
      if (snap.exists()) setCreds(snap.data() as BcelCreds);
    });
  }, []);

  const credsComplete = !!(creds.merchantId && creds.apiKey && creds.apiSecret);

  const saveCreds = async () => {
    setSavingCreds(true);
    try {
      await setDoc(doc(db, 'secureConfig', 'bcel'), creds);
    } finally {
      setSavingCreds(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'walletConfig', 'default'), config);
    } finally {
      setSaving(false);
    }
  };

  const uploadQr = async (file: File) => {
    setUploading(true);
    try {
      const storageRef = ref(storage, `walletConfig/qr-${Date.now()}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setConfig((c) => ({ ...c, bankQrImageUrl: url }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1>{t('wallet.title')}</h1>
        <p className="muted">{t('wallet.tagline')}</p>
      </header>

      <div className="pricing-card" style={{ maxWidth: 480 }}>
        <label>{t('wallet.commissionRate')}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={config.commissionRate}
          onChange={(e) => setConfig({ ...config, commissionRate: Number(e.target.value) })}
        />
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {t('wallet.commissionRateHint', { percent: (config.commissionRate * 100).toFixed(0) })}
        </p>

        <label>{t('wallet.minimumBalance', { currency: config.currency })}</label>
        <input
          type="number"
          value={config.minimumBalance}
          onChange={(e) => setConfig({ ...config, minimumBalance: Number(e.target.value) })}
        />

        <label>{t('wallet.topUpMode')}</label>
        <select
          value={config.topUpMode}
          onChange={(e) => setConfig({ ...config, topUpMode: e.target.value as 'manual' | 'auto' })}
        >
          <option value="manual">{t('wallet.topUpModeManual')}</option>
          <option value="auto" disabled={!credsComplete}>
            {t('wallet.topUpModeAuto')}
          </option>
        </select>
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {credsComplete ? t('wallet.topUpModeAutoReady') : t('wallet.topUpModeAutoHint')}
        </p>

        <label>{t('wallet.bankName')}</label>
        <input value={config.bankName} onChange={(e) => setConfig({ ...config, bankName: e.target.value })} />

        <label>{t('wallet.bankAccountName')}</label>
        <input
          value={config.bankAccountName}
          onChange={(e) => setConfig({ ...config, bankAccountName: e.target.value })}
        />

        <label>{t('wallet.bankAccountNumber')}</label>
        <input
          value={config.bankAccountNumber}
          onChange={(e) => setConfig({ ...config, bankAccountNumber: e.target.value })}
        />

        <label>{t('wallet.qrImage')}</label>
        {config.bankQrImageUrl && (
          <img src={config.bankQrImageUrl} alt="Bank QR" style={{ width: 160, height: 160, objectFit: 'contain', marginTop: 6 }} />
        )}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => e.target.files?.[0] && uploadQr(e.target.files[0])}
          style={{ marginTop: 6 }}
        />

        <button className="btn-primary" disabled={saving} onClick={save} style={{ marginTop: 20 }}>
          {saving ? t('pricing.saving') : t('pricing.save')}
        </button>
      </div>

      <div className="pricing-card" style={{ maxWidth: 480, marginTop: 24 }}>
        <h3 style={{ margin: '0 0 4px' }}>{t('wallet.bcelTitle')}</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          {t('wallet.bcelTagline')}
        </p>

        <label>{t('wallet.bcelMerchantId')}</label>
        <input value={creds.merchantId} onChange={(e) => setCreds({ ...creds, merchantId: e.target.value })} />

        <label>{t('wallet.bcelApiKey')}</label>
        <input
          type="password"
          value={creds.apiKey}
          onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })}
        />

        <label>{t('wallet.bcelApiSecret')}</label>
        <input
          type="password"
          value={creds.apiSecret}
          onChange={(e) => setCreds({ ...creds, apiSecret: e.target.value })}
        />

        <label>{t('wallet.bcelWebhookSecret')}</label>
        <input
          type="password"
          value={creds.webhookSecret}
          onChange={(e) => setCreds({ ...creds, webhookSecret: e.target.value })}
        />

        <button className="btn-primary" disabled={savingCreds} onClick={saveCreds} style={{ marginTop: 20 }}>
          {savingCreds ? t('pricing.saving') : t('pricing.save')}
        </button>

        {!credsComplete && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {t('wallet.bcelIncompleteNote')}
          </p>
        )}
      </div>
    </div>
  );
}
