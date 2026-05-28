import { X, Shield, ShieldOff, Lock, Unlock, Activity, DoorOpen, DoorClosed } from 'lucide-react';
import type { HaEntity } from '../types/ha';
import { securityEntities } from '../config/rooms';

interface Props {
  entities: Record<string, HaEntity>;
  onClose: () => void;
  callService: (domain: string, service: string, target: { entity_id: string }, data?: Record<string, unknown>) => void;
}

export default function SecurityPanel({ entities, onClose, callService }: Props) {
  const alarm = entities['alarm_control_panel.alarmo'];
  const isArmed = alarm && alarm.state !== 'disarmed';

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-surface-card border-t border-surface-border rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-surface-border rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">Security</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Alarm control */}
        {alarm && (
          <div className={`p-4 rounded-2xl mb-4 ${isArmed ? 'bg-accent-green/10 border border-accent-green/20' : 'bg-surface-elevated'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isArmed
                  ? <Shield className="w-6 h-6 text-accent-green" />
                  : <ShieldOff className="w-6 h-6 text-white/40" />
                }
                <div>
                  <div className="font-semibold">Alarm System</div>
                  <div className="text-xs text-white/50 capitalize">{alarm.state.replace(/_/g, ' ')}</div>
                </div>
              </div>
              <button
                onClick={() => callService(
                  'alarm_control_panel',
                  isArmed ? 'alarm_disarm' : 'alarm_arm_away',
                  { entity_id: 'alarm_control_panel.alarmo' },
                  isArmed ? { code: '' } : {}
                )}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  isArmed
                    ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                    : 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                }`}
              >
                {isArmed ? 'Disarm' : 'Arm Away'}
              </button>
            </div>
          </div>
        )}

        {/* Sensors list */}
        <div className="overflow-y-auto divide-y divide-surface-border">
          {securityEntities.slice(1).map(def => {
            const entity = entities[def.entity_id];
            const unavail = !entity || entity.state === 'unavailable';
            const isActive = entity?.state === 'on';
            const isLock = def.type === 'lock';
            const locked = entity?.state === 'locked';

            return (
              <div key={def.entity_id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {isLock
                    ? (locked ? <Lock className="w-4 h-4 text-accent-green" /> : <Unlock className="w-4 h-4 text-accent-amber" />)
                    : def.name.toLowerCase().includes('door')
                    ? (isActive ? <DoorOpen className="w-4 h-4 text-accent-red" /> : <DoorClosed className="w-4 h-4 text-white/40" />)
                    : <Activity className="w-4 h-4 text-white/40" />
                  }
                  <span className="text-sm text-white/70">{def.name}</span>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  unavail ? 'bg-surface-elevated text-white/30' :
                  isLock
                    ? locked ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-amber/15 text-accent-amber'
                    : isActive
                    ? 'bg-accent-amber/15 text-accent-amber'
                    : 'bg-surface-elevated text-white/40'
                }`}>
                  {unavail ? 'N/A' :
                    isLock ? (locked ? 'Locked' : 'Unlocked') :
                    isActive ? 'Active' : 'Clear'
                  }
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
