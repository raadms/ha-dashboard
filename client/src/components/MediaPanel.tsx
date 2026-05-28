import { X, Play, Pause, SkipForward, SkipBack, Volume2, Radio } from 'lucide-react';
import type { HaEntity } from '../types/ha';

interface Props {
  entities: Record<string, HaEntity>;
  onClose: () => void;
  callService: (domain: string, service: string, target: { entity_id: string }, data?: Record<string, unknown>) => void;
}

function MediaPlayerCard({
  entity_id, name, entity, callService,
}: {
  entity_id: string; name: string; entity: HaEntity | undefined;
  callService: Props['callService'];
}) {
  const state = entity?.state ?? 'off';
  const isActive = ['playing', 'paused', 'idle'].includes(state);
  const isPlaying = state === 'playing';
  const title = entity?.attributes?.media_title as string | undefined;
  const artist = entity?.attributes?.media_artist as string | undefined;
  const volume = entity?.attributes?.volume_level as number | undefined;

  return (
    <div className={`p-4 rounded-2xl border transition-colors ${
      isActive ? 'bg-accent-purple/10 border-accent-purple/20' : 'bg-surface-elevated border-surface-border'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{name}</div>
          {title && <div className="text-xs text-white/50 truncate mt-0.5">{title}{artist ? ` · ${artist}` : ''}</div>}
          {!title && <div className="text-xs text-white/30 mt-0.5 capitalize">{state}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isActive ? 'bg-accent-purple/20 text-accent-purple' : 'bg-surface-border text-white/30'
        }`}>
          {state}
        </span>
      </div>
      {isActive && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => callService('media_player', 'media_previous_track', { entity_id })}
            className="btn-icon w-9 h-9 bg-surface-card hover:bg-surface-border text-white/60"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => callService('media_player', isPlaying ? 'media_pause' : 'media_play', { entity_id })}
            className="btn-icon flex-1 h-9 bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => callService('media_player', 'media_next_track', { entity_id })}
            className="btn-icon w-9 h-9 bg-surface-card hover:bg-surface-border text-white/60"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          {volume !== undefined && (
            <div className="flex items-center gap-1.5 ml-2 text-white/40">
              <Volume2 className="w-3 h-3" />
              <span className="text-xs">{Math.round(volume * 100)}%</span>
            </div>
          )}
        </div>
      )}
      {!isActive && (
        <button
          onClick={() => callService('media_player', 'turn_on', { entity_id })}
          className="w-full py-2 rounded-xl bg-surface-card hover:bg-surface-border text-white/40 text-xs font-medium transition-all active:scale-95"
        >
          Turn On
        </button>
      )}
    </div>
  );
}

export default function MediaPanel({ entities, onClose, callService }: Props) {
  const radio = entities['input_boolean.radio_on_sw'];
  const radioOn = radio?.state === 'on';

  const players = [
    { entity_id: 'media_player.homepod_mini', name: 'HomePod Mini' },
    { entity_id: 'media_player.appletv', name: 'Apple TV' },
    { entity_id: 'media_player.lg_webos_tv_uj670v', name: 'LG TV' },
  ];

  const scenes = [
    { entity_id: 'scene.movie_time', name: 'Movie Time', emoji: '🎬' },
    { entity_id: 'scene.appletv_scene', name: 'Apple TV Lights', emoji: '🍎' },
    { entity_id: 'scene.appletv_scene_lightoff', name: 'Lights Off', emoji: '🌙' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-surface-card border-t border-surface-border rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-surface-border rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">Media</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-4">
          {/* Radio */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border ${
            radioOn ? 'bg-accent-amber/10 border-accent-amber/20' : 'bg-surface-elevated border-surface-border'
          }`}>
            <div className="flex items-center gap-3">
              <Radio className={`w-5 h-5 ${radioOn ? 'text-accent-amber' : 'text-white/40'}`} />
              <span className="font-semibold text-sm">Radio</span>
            </div>
            <button
              onClick={() => callService('input_boolean', 'toggle', { entity_id: 'input_boolean.radio_on_sw' })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${radioOn ? 'bg-accent-amber' : 'bg-surface-border'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${radioOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Players */}
          <div className="space-y-3">
            {players.map(p => (
              <MediaPlayerCard
                key={p.entity_id}
                entity_id={p.entity_id}
                name={p.name}
                entity={entities[p.entity_id]}
                callService={callService}
              />
            ))}
          </div>

          {/* Scenes */}
          <div>
            <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Scenes</div>
            <div className="grid grid-cols-3 gap-2">
              {scenes.map(s => (
                <button
                  key={s.entity_id}
                  onClick={() => callService('scene', 'turn_on', { entity_id: s.entity_id })}
                  className="p-3 card rounded-2xl flex flex-col items-center gap-1.5 hover:border-accent-blue/30 transition-all active:scale-95"
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-xs text-white/60 text-center leading-tight">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
