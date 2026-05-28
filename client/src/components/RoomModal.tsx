import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { HaEntity } from '../types/ha';
import type { RoomConfig } from '../config/rooms';
import EntityControl from './EntityControl';

interface Props {
  room: RoomConfig | null;
  entities: Record<string, HaEntity>;
  onClose: () => void;
  callService: (domain: string, service: string, target: { entity_id: string }, data?: Record<string, unknown>) => void;
}

function domainFor(type: string): string {
  if (type === 'switch' || type === 'input_boolean') return type;
  if (type === 'light') return 'light';
  if (type === 'climate') return 'climate';
  if (type === 'media_player') return 'media_player';
  if (type === 'lock') return 'lock';
  return type.split('.')[0];
}

export default function RoomModal({ room, entities, onClose, callService }: Props) {
  useEffect(() => {
    if (!room) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [room, onClose]);

  if (!room) return null;

  function toggle(entity_id: string, type: string, currentState: string) {
    const domain = domainFor(type);
    if (domain === 'lock') {
      callService('lock', currentState === 'locked' ? 'unlock' : 'lock', { entity_id });
    } else if (domain === 'climate') {
      callService('climate', currentState === 'off' ? 'turn_on' : 'turn_off', { entity_id });
    } else if (domain === 'media_player') {
      callService('media_player', 'media_play_pause', { entity_id });
    } else {
      callService(domain, 'toggle', { entity_id });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-surface-card border-t border-surface-border rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-surface-border rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{room.name}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Entities */}
        <div className="overflow-y-auto divide-y divide-surface-border">
          {room.entities.map(def => {
            const entity = entities[def.entity_id];
            return (
              <EntityControl
                key={def.entity_id}
                entity={entity}
                def={def}
                onToggle={() => toggle(def.entity_id, def.type, entity?.state ?? 'off')}
                onServiceCall={(domain, service, data) =>
                  callService(domain, service, { entity_id: def.entity_id }, data)
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
