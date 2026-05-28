import { X, RefreshCw, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { HaEntity } from '../types/ha';
import { cameraEntities } from '../config/rooms';

interface Props {
  entities: Record<string, HaEntity>;
  token: string;
  onClose: () => void;
}

function CameraFeed({ entityId, name, token }: { entityId: string; name: string; token: string }) {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function refresh() {
    setLoading(true);
    setError(false);
    setSrc(`/api/camera/${entityId}?token=${token}&t=${Date.now()}`);
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="rounded-2xl overflow-hidden bg-surface-elevated border border-surface-border">
      <div className="relative aspect-video bg-black">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30">
            <Activity className="w-6 h-6" />
            <span className="text-xs">Camera unavailable</span>
          </div>
        )}
        {src && (
          <img
            src={src}
            alt={name}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium text-white/70">{name}</span>
        <button
          onClick={refresh}
          className="w-7 h-7 rounded-lg bg-surface-card flex items-center justify-center active:scale-90 transition-transform"
        >
          <RefreshCw className="w-3.5 h-3.5 text-white/50" />
        </button>
      </div>
    </div>
  );
}

export default function CamerasPanel({ entities: _entities, token, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-surface-card border-t border-surface-border rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-surface-border rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">Cameras</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <div className="overflow-y-auto space-y-4">
          {cameraEntities.map(cam => (
            <CameraFeed
              key={cam.entity_id}
              entityId={cam.entity_id}
              name={cam.name}
              token={token}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
