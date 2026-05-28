export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HaStateChangedEvent {
  entity_id: string;
  new_state: HaEntity | null;
  old_state: HaEntity | null;
}

export type EntityDomain =
  | 'switch' | 'light' | 'climate' | 'media_player' | 'sensor'
  | 'binary_sensor' | 'lock' | 'input_boolean' | 'script' | 'scene'
  | 'remote' | 'alarm_control_panel' | 'person' | 'weather' | 'camera';
