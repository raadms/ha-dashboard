import { Thermometer, Droplets, Zap, Activity, DoorOpen, DoorClosed } from 'lucide-react';
import type { HaEntity } from '../types/ha';
import type { EntityDef } from '../config/rooms';

interface Props {
  entity: HaEntity | undefined;
  def: EntityDef;
  onToggle: () => void;
  onServiceCall?: (domain: string, service: string, data?: Record<string, unknown>) => void;
  compact?: boolean;
}

function ToggleButton({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
        on ? 'bg-accent-blue' : 'bg-surface-border'
      } disabled:opacity-40`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function EntityControl({ entity, def, onToggle, onServiceCall, compact }: Props) {
  const isOn = entity?.state === 'on' || entity?.state === 'locked';
  const unavailable = !entity || entity.state === 'unavailable';

  if (def.type === 'sensor') {
    const icon = def.unit === '°C' ? Thermometer : def.unit === '%' ? Droplets : def.unit === 'W' ? Zap : Activity;
    const Icon = icon;
    return (
      <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/70">{def.name}</span>
        </div>
        <span className="text-sm font-semibold text-white/90">
          {unavailable ? '—' : `${entity.state}${def.unit ?? ''}`}
        </span>
      </div>
    );
  }

  if (def.type === 'binary_sensor') {
    const isDoorType = def.name.toLowerCase().includes('door');
    const isActive = entity?.state === 'on';
    return (
      <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
        <div className="flex items-center gap-2.5">
          {isDoorType
            ? (isActive ? <DoorOpen className="w-4 h-4 text-accent-red" /> : <DoorClosed className="w-4 h-4 text-accent-green" />)
            : <Activity className="w-4 h-4 text-white/40" />
          }
          <span className="text-sm text-white/70">{def.name}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          isActive
            ? isDoorType ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-green/15 text-accent-green'
            : 'bg-surface-elevated text-white/40'
        }`}>
          {unavailable ? 'N/A' : isActive ? (isDoorType ? 'Open' : 'Active') : (isDoorType ? 'Closed' : 'Clear')}
        </span>
      </div>
    );
  }

  if (def.type === 'climate') {
    const attrs = entity?.attributes ?? {};
    const currentTemp = attrs.current_temperature as number | undefined;
    const targetTemp = attrs.temperature as number | undefined;
    const mode = entity?.state ?? 'off';
    const isRunning = mode !== 'off';

    return (
      <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
        <div className="flex items-center gap-2.5">
          <Thermometer className={`w-4 h-4 ${isRunning ? 'text-accent-teal' : 'text-white/40'}`} />
          <div>
            <div className="text-sm text-white/70">{def.name}</div>
            {isRunning && targetTemp && (
              <div className="text-xs text-white/40">Target {targetTemp}°C</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentTemp !== undefined && (
            <span className="text-sm font-semibold text-white/70">{currentTemp}°</span>
          )}
          <ToggleButton on={isRunning} onClick={onToggle} disabled={unavailable} />
        </div>
      </div>
    );
  }

  if (def.type === 'media_player') {
    const state = entity?.state ?? 'off';
    const isPlaying = ['playing', 'paused', 'idle'].includes(state);
    const title = entity?.attributes?.media_title as string | undefined;
    return (
      <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Activity className={`w-4 h-4 shrink-0 ${isPlaying ? 'text-accent-purple' : 'text-white/40'}`} />
          <div className="min-w-0">
            <div className="text-sm text-white/70 truncate">{def.name}</div>
            {title && <div className="text-xs text-white/40 truncate">{title}</div>}
          </div>
        </div>
        <ToggleButton on={isPlaying} onClick={onToggle} disabled={unavailable} />
      </div>
    );
  }

  if (def.type === 'lock') {
    const locked = entity?.state === 'locked';
    return (
      <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
        <div className="flex items-center gap-2.5">
          <span className="text-base">{locked ? '🔒' : '🔓'}</span>
          <span className="text-sm text-white/70">{def.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            locked ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-amber/15 text-accent-amber'
          }`}>
            {unavailable ? 'N/A' : locked ? 'Locked' : 'Unlocked'}
          </span>
          <ToggleButton
            on={locked}
            onClick={() => {
              if (onServiceCall) {
                onServiceCall('lock', locked ? 'unlock' : 'lock');
              }
            }}
            disabled={unavailable}
          />
        </div>
      </div>
    );
  }

  // switch / light / input_boolean / remote / default
  return (
    <div className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
      <span className="text-sm text-white/70">{def.name}</span>
      <ToggleButton on={!!isOn} onClick={onToggle} disabled={unavailable} />
    </div>
  );
}
