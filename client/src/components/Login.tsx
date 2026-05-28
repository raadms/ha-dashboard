import { useState, FormEvent } from 'react';
import { Home, Lock, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onLogin: (password: string) => void;
  error: string;
  loading: boolean;
  dashboardName: string;
}

export default function Login({ onLogin, error, loading, dashboardName }: Props) {
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password) onLogin(password);
  }

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-accent-blue/20 flex items-center justify-center mx-auto">
            <Home className="w-8 h-8 text-accent-blue" />
          </div>
          <h1 className="text-2xl font-bold">{dashboardName}</h1>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-surface-card border border-surface-border rounded-2xl pl-11 pr-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-accent-blue transition-colors text-base"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-accent-red text-sm bg-accent-red/10 border border-accent-red/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-4 bg-accent-blue hover:bg-accent-blue/90 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
