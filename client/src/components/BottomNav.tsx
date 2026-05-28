import { Lightbulb, Tv, Shield, Camera } from 'lucide-react';

type Panel = 'lights' | 'media' | 'security' | 'cameras' | null;

interface Props {
  active: Panel;
  onSelect: (panel: Panel) => void;
}

const items: { id: Exclude<Panel, null>; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'lights', label: 'Lights', icon: Lightbulb },
  { id: 'media', label: 'Media', icon: Tv },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'cameras', label: 'Cameras', icon: Camera },
];

export default function BottomNav({ active, onSelect }: Props) {
  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="bg-surface-card border border-surface-border rounded-2xl flex">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(isActive ? null : id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all duration-150 active:scale-95 ${
                isActive ? 'bg-accent-blue/15' : ''
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-accent-blue' : 'text-white/40'}`} />
              <span className={`text-xs font-medium ${isActive ? 'text-accent-blue' : 'text-white/30'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
