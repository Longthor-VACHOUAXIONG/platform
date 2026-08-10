import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../lib/firebaseConfig';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // /login isn't wrapped in ProtectedRoute, so navigate explicitly —
      // the auth listener flips ProtectedRoute to the admin layout next.
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? t('login.signInFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>GoFair Admin</h1>
        <p className="muted">{t('login.signInTagline')}</p>

        <label>{t('login.email')}</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

        <label>{t('login.password')}</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

        {error && <p className="error-text">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>

        <p className="note">
          {t('login.noAdminNote')} <code>scripts/bootstrap-admin.ts</code> {t('login.toGrantAdmin')}
        </p>
      </form>
    </div>
  );
}
