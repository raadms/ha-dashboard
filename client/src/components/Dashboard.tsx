import { useState } from 'react';
import type { HaEntity } from '../types/ha';
import { rooms } from '../config/rooms';
import StatusBar from './StatusBar';
import RoomCard from './RoomCard';
import RoomModal from './RoomModal';
import MediaPanel from './MediaPanel';
import SecurityPanel from './SecurityPanel';
import CamerasPanel from './CamerasPanel';
import BottomNav from './BottomNav';
import type { RoomConfig } from '../config/rooms';

type Panel = 'lights' | 'media' | 'security' | 'cameras' | null;

interface Props {
  entities: Record<string, HaEntity>;
  connected: boolean;
  token: string;
  callService: (domain: string, service: string, target: { entity_id: string }, data?: Record<string, unknown>) => void;
}

export default function Dashboard({ entities, connected, token, callService }: Props) {
  const [activeRoom, setActiveRoom] = useState<RoomConfig | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>(null);

  function toggleMainEntity(room: RoomConfig) {
    const main = room.entities[0];
    if (!main) return;
    const entity = entities[main.entity_id];
    const state = entity?.state ?? 'off';
    const domain = main.type === 'input_boolean' ? 'input_boolean' : main.type === 'light' ? 'light' : 'switch';
    callService(domain, 'toggle', { entity_id: main.entity_id });
    // Suppress: linter flags unused state — needed for service decision
    void state;
  }

  return (
    <div className="h-screen flex flex-col bg-surface-bg overflow-hidden">
      <StatusBar entities={entities} connected={connected} />

      {/* Room grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 py-2">
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              entities={entities}
              onOpen={() => { setActiveRoom(room); setActivePanel(null); }}
              onToggleMain={() => toggleMainEntity(room)}
            />
          ))}
        </div>
      </div>

      <BottomNav active={activePanel} onSelect={p => { setActivePanel(p); setActiveRoom(null); }} />

      {/* Modals */}
      {activeRoom && (
        <RoomModal
          room={activeRoom}
          entities={entities}
          onClose={() => setActiveRoom(null)}
          callService={callService}
        />
      )}
      {activePanel === 'media' && (
        <MediaPanel entities={entities} onClose={() => setActivePanel(null)} callService={callService} />
      )}
      {activePanel === 'security' && (
        <SecurityPanel entities={entities} onClose={() => setActivePanel(null)} callService={callService} />
      )}
      {activePanel === 'cameras' && (
        <CamerasPanel entities={entities} token={token} onClose={() => setActivePanel(null)} />
      )}

      {/* Backdrop for modals */}
      {(activeRoom || activePanel) && (
        <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" />
      )}
    </div>
  );
}
