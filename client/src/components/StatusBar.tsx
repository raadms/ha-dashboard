import { useEffect, useState } from 'react';
import { Shield, ShieldOff, Lock, DoorOpen, Cloud, Wifi, WifiOff, User } from 'lucide-react';
import type { HaEntity } from '../types/ha';
import { statusEntities } from '../config/rooms';

interface Props {
  entities: Record<string, HaEntity>;
  connected: boolean;
}

function useTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function weatherIcon(state: string): string {
  const map: Record<string, string> = {
    sunny: '☀️', 'clear-night': '🌙', cloudy: '☁️', fog: '🌫️',
    hail: '🌨️', lightning: '⚡', 'lightning-rainy': '⛈️',
    partlycloudy: '⛅', pouring: '🌧️', rainy: '🌦️',
    snowy: '❄️', 'snowy-rainy': '🌨️', windy: '💨',
  };
  return map[state] ?? '🌡️';
}

export default function StatusBar({ entities, connected }: Props) {
  const now = useTime();
  const alarm = entities[statusEntities.alarm];
  const weather = entities[statusEntities.weather];
  const raed = entities[statusEntities.raed];
  const rola = entities[statusEntities.rola];
  const lock = entities[statusEntities.lock];
  const door = entities[statusEntities.door];

  const isArmed = alarm && !['disarmed'].includes(alarm.state);
  const isUnlocked = lock?.state === 'unlocked';
  const isDoorOpen = door?.state === 'on';
  const temp = weather?.attributes?.temperature as number | undefined;

  return (
    <div className="flex items-center justify-between px-5 py-3 shrink-0">
      {/* Time */}
      <div className="space-y-0.5">
        <div className="text-2xl font-bold tabular-nums leading-none">
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </div>
        <div className="text-xs text-white/40 font-medium">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Connection */}
        <div className={`chip ${connected ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'}`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? 'Live' : 'Offline'}
        </div>

        {/* Weather */}
        {weather && (
          <div className="chip bg-surface-elevated text-white/70">
            <span>{weatherIcon(weather.state)}</span>
            {temp !== undefined && <span>{Math.round(temp)}°</span>}
          </div>
        )}

        {/* Alarm */}
        {alarm && (
          <div className={`chip ${isArmed ? 'bg-accent-green/15 text-accent-green' : 'bg-surface-elevated text-white/50'}`}>
            {isArmed ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
            {isArmed ? alarm.state.replace(/_/g, ' ') : 'Disarmed'}
          </div>
        )}

        {/* Lock — only show when unlocked as alert */}
        {isUnlocked && (
          <div className="chip bg-accent-amber/15 text-accent-amber">
            <Lock className="w-3 h-3" />
            Unlocked
          </div>
        )}

        {/* Door — only show when open */}
        {isDoorOpen && (
          <div className="chip bg-accent-red/15 text-accent-red animate-pulse">
            <DoorOpen className="w-3 h-3" />
            Open
          </div>
        )}

        {/* Presence */}
        {raed && (
          <div className={`chip ${raed.state === 'home' ? 'bg-accent-blue/15 text-accent-blue' : 'bg-surface-elevated text-white/40'}`}>
            <User className="w-3 h-3" />
            Raed
          </div>
        )}
        {rola && (
          <div className={`chip ${rola.state === 'home' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-surface-elevated text-white/40'}`}>
            <User className="w-3 h-3" />
            Rola
          </div>
        )}
      </div>
    </div>
  );
}
