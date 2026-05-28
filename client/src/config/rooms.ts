export type EntityType =
  | 'switch' | 'light' | 'climate' | 'media_player' | 'sensor'
  | 'binary_sensor' | 'lock' | 'input_boolean' | 'script' | 'scene' | 'remote';

export interface EntityDef {
  entity_id: string;
  name: string;
  type: EntityType;
  unit?: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  icon: string;
  mainEntity: string;
  entities: EntityDef[];
}

export const rooms: RoomConfig[] = [
  {
    id: 'living',
    name: 'Living Room',
    icon: 'sofa',
    mainEntity: 'switch.livingroomswitchgroup',
    entities: [
      { entity_id: 'switch.livingroomswitchgroup', name: 'Lights', type: 'switch' },
      { entity_id: 'light.tv_led', name: 'TV LED', type: 'light' },
      { entity_id: 'climate.1e05049f', name: 'AC', type: 'climate' },
      { entity_id: 'media_player.lg_webos_tv_uj670v', name: 'LG TV', type: 'media_player' },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    icon: 'utensils',
    mainEntity: 'switch.kitchen_group_switch',
    entities: [
      { entity_id: 'switch.kitchen_group_switch', name: 'Lights', type: 'switch' },
      { entity_id: 'light.wled_2', name: 'LED Strip', type: 'light' },
      { entity_id: 'binary_sensor.kitchensensor_occupancy', name: 'Motion', type: 'binary_sensor' },
      { entity_id: 'sensor.kitchensensor_device_temperature', name: 'Temp', type: 'sensor', unit: '°C' },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    icon: 'bed-double',
    mainEntity: 'switch.masterroom_group_switch',
    entities: [
      { entity_id: 'switch.masterroom_group_switch', name: 'Lights', type: 'switch' },
      { entity_id: 'climate.1e050116', name: 'AC', type: 'climate' },
      { entity_id: 'sensor.master_temp_temperature', name: 'Temp', type: 'sensor', unit: '°C' },
      { entity_id: 'sensor.master_temp_humidity', name: 'Humidity', type: 'sensor', unit: '%' },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    icon: 'monitor',
    mainEntity: 'switch.office_group_swithces',
    entities: [
      { entity_id: 'switch.office_group_swithces', name: 'Lights', type: 'switch' },
      { entity_id: 'climate.1e51b62f', name: 'AC', type: 'climate' },
      { entity_id: 'switch.athom_smart_plug_v3_50b5b0_power', name: 'Rack Plug', type: 'switch' },
      { entity_id: 'sensor.athom_smart_plug_v3_50b5b0_power', name: 'Power', type: 'sensor', unit: 'W' },
    ],
  },
  {
    id: 'baby',
    name: "Baby's Room",
    icon: 'baby',
    mainEntity: 'switch.baby_room',
    entities: [
      { entity_id: 'switch.baby_room', name: 'Lights', type: 'switch' },
      { entity_id: 'switch.laundry_light_left', name: 'Left Light', type: 'switch' },
      { entity_id: 'switch.laundry_light_right', name: 'Right Light', type: 'switch' },
      { entity_id: 'climate.1e51bb2c', name: 'AC', type: 'climate' },
    ],
  },
  {
    id: 'guest',
    name: 'Guest Room',
    icon: 'users',
    mainEntity: 'switch.guest_room_switches',
    entities: [
      { entity_id: 'switch.guest_room_switches', name: 'Lights', type: 'switch' },
      { entity_id: 'switch.guest_light_left', name: 'Left', type: 'switch' },
      { entity_id: 'switch.guest_light_center', name: 'Center', type: 'switch' },
      { entity_id: 'switch.guest_light_right', name: 'Right', type: 'switch' },
    ],
  },
  {
    id: 'door',
    name: 'Main Door',
    icon: 'door-open',
    mainEntity: 'binary_sensor.maindoorsensor_contact',
    entities: [
      { entity_id: 'lock.aqara_smart_lock_u200', name: 'Lock', type: 'lock' },
      { entity_id: 'binary_sensor.maindoorsensor_contact', name: 'Door', type: 'binary_sensor' },
      { entity_id: 'binary_sensor.entrance_motion_sensor_occupancy', name: 'Motion', type: 'binary_sensor' },
      { entity_id: 'switch.hallway_switches', name: 'Hallway', type: 'switch' },
    ],
  },
  {
    id: 'media',
    name: 'Media',
    icon: 'tv',
    mainEntity: 'media_player.appletv',
    entities: [
      { entity_id: 'media_player.homepod_mini', name: 'HomePod', type: 'media_player' },
      { entity_id: 'media_player.appletv', name: 'Apple TV', type: 'media_player' },
      { entity_id: 'media_player.lg_webos_tv_uj670v', name: 'LG TV', type: 'media_player' },
      { entity_id: 'input_boolean.radio_on_sw', name: 'Radio', type: 'input_boolean' },
    ],
  },
];

// Security panel entities
export const securityEntities: EntityDef[] = [
  { entity_id: 'alarm_control_panel.alarmo', name: 'Alarm', type: 'switch' },
  { entity_id: 'lock.aqara_smart_lock_u200', name: 'Main Lock', type: 'lock' },
  { entity_id: 'binary_sensor.maindoorsensor_contact', name: 'Main Door', type: 'binary_sensor' },
  { entity_id: 'binary_sensor.entrance_motion_sensor_occupancy', name: 'Entrance Motion', type: 'binary_sensor' },
  { entity_id: 'binary_sensor.kitchensensor_occupancy', name: 'Kitchen Motion', type: 'binary_sensor' },
  { entity_id: 'binary_sensor.storagemotionsensor_occupancy', name: 'Storage Motion', type: 'binary_sensor' },
  { entity_id: 'binary_sensor.g4_doorbell_pro_poe_doorbell', name: 'Doorbell', type: 'binary_sensor' },
  { entity_id: 'binary_sensor.g4_doorbell_pro_poe_person_detected', name: 'Person Detected', type: 'binary_sensor' },
];

export const cameraEntities = [
  { entity_id: 'camera.g4_doorbell_pro_poe_high_resolution_channel', name: 'Front Door' },
  { entity_id: 'camera.g4_doorbell_pro_poe_package_camera', name: 'Package Camera' },
];

// Status bar entities
export const statusEntities = {
  alarm: 'alarm_control_panel.alarmo',
  weather: 'weather.forecast_home',
  raed: 'person.raed',
  rola: 'person.rola',
  lock: 'lock.aqara_smart_lock_u200',
  door: 'binary_sensor.maindoorsensor_contact',
  doorbell: 'binary_sensor.g4_doorbell_pro_poe_doorbell',
  allLights: 'light.all_lights_group',
};
