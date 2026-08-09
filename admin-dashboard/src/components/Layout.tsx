import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { auth } from '../lib/firebaseConfig';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

export default function Layout() {
  const { t, i18n } = useTranslation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <span>GoFair Admin</span>
        </div>
        <nav>
          <NavLink to="/rides" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.liveRides')}
          </NavLink>
          <NavLink to="/drivers" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.drivers')}
          </NavLink>
          <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.pricing')}
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.analytics')}
          </NavLink>
          <NavLink to="/topups" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.topups')}
          </NavLink>
          <NavLink to="/wallet-settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.walletSettings')}
          </NavLink>
        </nav>
        <label className="language-select-label">
          {t('nav.language')}
          <select
            className="language-select"
            value={i18n.language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>
        <button className="signout" onClick={() => signOut(auth)}>
          {t('nav.signOut')}
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
