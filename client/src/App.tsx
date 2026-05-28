import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useHA } from './hooks/useHA';
import Setup from './components/Setup';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [dashboardName, setDashboardName] = useState('Home Dashboard');
  const { token, error, loading, login } = useAuth();
  const { entities, connected, callService } = useHA(token);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((d: { configured?: boolean; name?: string }) => {
        setConfigured(d.configured ?? false);
        if (d.name) setDashboardName(d.name);
      })
      .catch(() => setConfigured(false));
  }, []);

  if (configured === null) {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!configured) {
    return <Setup onComplete={() => { setConfigured(true); }} />;
  }

  if (!token) {
    return <Login onLogin={login} error={error} loading={loading} dashboardName={dashboardName} />;
  }

  return (
    <Dashboard
      entities={entities}
      connected={connected}
      token={token}
      callService={callService}
    />
  );
}
