import { useState, FormEvent } from 'react';
import { Home, Server, Key, Lock, CheckCircle, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'ha' | 'password' | 'done';

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [haUrl, setHaUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dashboardName, setDashboardName] = useState('Home Dashboard');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [error, setError] = useState('');

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await fetch('/api/test-ha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) { setTestResult('ok'); }
      else { setTestResult('fail'); setError(data.error ?? 'Connection failed'); }
    } catch {
      setTestResult('fail');
      setError('Could not reach server');
    } finally {
      setTesting(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken, password, dashboardName }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) { setStep('done'); }
      else { setError(data.error ?? 'Setup failed'); }
    } catch {
      setError('Server error');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-3xl bg-accent-blue/20 flex items-center justify-center mx-auto">
              <Home className="w-10 h-10 text-accent-blue" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
            <p className="text-white/50 text-base">
              Let's connect your Home Assistant instance. This takes about 2 minutes.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Server, label: 'Connect to Home Assistant' },
              { icon: Key, label: 'Enter your access token' },
              { icon: Lock, label: 'Set a dashboard password' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-4 p-4 card">
                <div className="w-9 h-9 rounded-xl bg-surface-elevated flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-white/60" />
                </div>
                <span className="text-sm font-medium text-white/80">{label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setStep('ha')}
            className="w-full py-4 bg-accent-blue hover:bg-accent-blue/90 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Get Started <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'ha') {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <div className="space-y-1">
            <p className="text-white/40 text-sm font-medium uppercase tracking-widest">Step 1 of 2</p>
            <h2 className="text-2xl font-bold">Home Assistant</h2>
            <p className="text-white/50 text-sm">Enter your HA URL and a Long-Lived Access Token.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">HA URL</label>
              <input
                type="url"
                placeholder="https://ha.yourdomain.com"
                value={haUrl}
                onChange={e => { setHaUrl(e.target.value); setTestResult(null); }}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Long-Lived Access Token</label>
              <textarea
                placeholder="Paste token from HA Profile → Security → Long-Lived Access Tokens"
                value={haToken}
                onChange={e => { setHaToken(e.target.value); setTestResult(null); }}
                rows={3}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-blue transition-colors resize-none text-xs font-mono"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-accent-red text-sm bg-accent-red/10 border border-accent-red/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {testResult === 'ok' && (
              <div className="flex items-center gap-2 text-accent-green text-sm bg-accent-green/10 border border-accent-green/20 rounded-xl px-4 py-3">
                <CheckCircle className="w-4 h-4" />
                Connected successfully!
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={testConnection}
              disabled={!haUrl || !haToken || testing}
              className="flex-1 py-3.5 bg-surface-elevated hover:bg-surface-border rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              Test Connection
            </button>
            <button
              onClick={() => { setError(''); setStep('password'); }}
              disabled={testResult !== 'ok'}
              className="flex-1 py-3.5 bg-accent-blue hover:bg-accent-blue/90 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
        <form onSubmit={finish} className="w-full max-w-md space-y-6 animate-fade-in">
          <div className="space-y-1">
            <p className="text-white/40 text-sm font-medium uppercase tracking-widest">Step 2 of 2</p>
            <h2 className="text-2xl font-bold">Dashboard Password</h2>
            <p className="text-white/50 text-sm">Set a password to protect your dashboard.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Dashboard Name</label>
              <input
                type="text"
                value={dashboardName}
                onChange={e => setDashboardName(e.target.value)}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Password</label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Confirm Password</label>
              <input
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-accent-red text-sm bg-accent-red/10 border border-accent-red/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('ha')}
              className="px-6 py-3.5 bg-surface-elevated rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!password || !confirmPassword || saving}
              className="flex-1 py-3.5 bg-accent-blue hover:bg-accent-blue/90 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Save & Finish
            </button>
          </div>
        </form>
      </div>
    );
  }

  // done
  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-accent-green/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-accent-green" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">All set!</h2>
          <p className="text-white/50">Your dashboard is ready. Sign in to get started.</p>
        </div>
        <button
          onClick={onComplete}
          className="w-full py-4 bg-accent-blue hover:bg-accent-blue/90 rounded-2xl font-semibold transition-all active:scale-[0.98]"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}
