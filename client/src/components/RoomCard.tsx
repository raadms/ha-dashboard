import {
  Sofa, Utensils, BedDouble, Monitor, Baby, Users, DoorOpen, Tv,
  Lightbulb, Thermometer, ChevronRight,
} from 'lucide-react';
import type { HaEntity } from '../types/ha';
import type { RoomConfig } from '../config/rooms';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sofa: Sofa, utensils: Utensils, 'bed-double': BedDouble,
  monitor: Monitor, baby: Baby, users: Users,
  'door-open': DoorOpen, tv: Tv,
};

interface Props {
  room: RoomConfig;
  entities: Record<string, HaEntity>;
  onOpen: () => void;
  onToggleMain: () => void;
}

export default function RoomCard({ room, entities, onOpen, onToggleMain }: Props) {
  const Icon = ICONS[room.icon] ?? Lightbulb;
  const mainEntity = entities[room.mainEntity];
  const isOn = mainEntity?.state === 'on' || mainEntity?.state === 'unlocked' || mainEntity?.state === 'paused' || mainEntity?.state === 'playing';
  const isDoorOpen = mainEntity?.state === 'on' && room.icon === 'door-open';

  // Find climate entity in the room
  const climateDef = room.entities.find(e => e.type === 'climate');
  const climate = climateDef ? entities[climateDef.entity_id] : undefined;
  const climateTemp = climate?.attributes?.current_temperature as number | undefined;
  const climateOn = climate && climate.state !== 'off';

  // Count active switches/lights
  const toggleEntities = room.entities.filter(e => ['switch', 'light', 'input_boolean'].includes(e.type));
  const activeCount = toggleEntities.filter(e => entities[e.entity_id]?.state === 'on').length;

  return (
    <div
      className={`card p-4 flex flex-col gap-3 cursor-pointer active:scale-[0.98] transition-all duration-150 ${
        isOn || isDoorOpen ? 'border-accent-blue/30' : ''
      }`}
      onClick={onOpen}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          isOn ? 'bg-accent-blue/20' : isDoorOpen ? 'bg-accent-red/20' : 'bg-surface-elevated'
        }`}>
          <Icon className={`w-5 h-5 ${isOn ? 'text-accent-blue' : isDoorOpen ? 'text-accent-red' : 'text-white/40'}`} />
        </div>
        <ChevronRight className="w-4 h-4 text-white/20 mt-1" />
      </div>

      {/* Room name */}
      <div>
        <div className="font-semibold text-sm">{room.name}</div>
        <div className="text-xs text-white/40 mt-0.5">
          {activeCount > 0 ? `${activeCount} light${activeCount > 1 ? 's' : ''} on` : 'All off'}
        </div>
      </div>

      {/* Quick info row */}
      <div className="flex items-center gap-3 mt-auto pt-1 border-t border-surface-border">
        {climateTemp !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${climateOn ? 'text-accent-teal' : 'text-white/30'}`}>
            <Thermometer className="w-3 h-3" />
            <span>{climateTemp}°C</span>
          </div>
        )}
        {/* Main toggle */}
        {mainEntity && ['switch', 'light', 'input_boolean'].includes(room.entities[0]?.type ?? '') && (
          <button
            className={`ml-auto relative w-9 h-5 rounded-full transition-colors duration-200 ${isOn ? 'bg-accent-blue' : 'bg-surface-border'}`}
            onClick={e => { e.stopPropagation(); onToggleMain(); }}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        )}
      </div>
    </div>
  );
}
