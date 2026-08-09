import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="loading-screen">{t('protectedRoute.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="loading-screen">
        <p>{t('protectedRoute.noAdminAccess')}</p>
        <p className="muted">{t('protectedRoute.askAdmin')}</p>
      </div>
    );
  }
  return <>{children}</>;
}
