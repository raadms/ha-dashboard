import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../../data');
const LAYOUT_FILE = join(DATA_DIR, 'layout.json');

export interface ExtraEntity {
  id: string;
  label: string;
  icon: string;
  entity: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  visible: boolean;
  order: number;
  colspan?: number;
  lights: string[];
  ac?: string;
  tv?: string;
  extras: ExtraEntity[];
}

export interface SensorConfig {
  id: string;
  entity: string;
  label: string;
  icon: string;
  okState: string;
  okLabel: string;
  warnLabel: string;
}

export interface CameraConfig {
  id: string;
  entity: string;
  label: string;
  streamUrl?: string;   // direct HLS URL (e.g. from Scrypted)
  streamType?: 'hls' | 'ha'; // 'hls' = use streamUrl directly, 'ha' = proxy via HA
  scryptedId?: string;  // Scrypted device ID (numeric string, found in Scrypted URL: /#/device/{id})
}

export interface MediaPlayerConfig {
  id: string;
  entity: string;
  label: string;
  icon: string;
}

export interface AppConfig {
  id: string;
  label: string;
  icon: string;
  actionType: 'input_button' | 'script' | 'boolean' | 'toggle';
  entity: string;
}

export interface UserConfig {
  id: string;
  name: string;
  username: string;     // login identifier (separate from display name)
  passwordHash: string;
  role: 'admin' | 'user';
  allowedRooms: string[] | null;
  allowedTabs: string[] | null;
}

export interface CustomTab {
  id: string;       // unique slug, e.g. "cameras"
  name: string;
  icon: string;     // emoji
  cameras: string[]; // entity IDs (must exist in security.cameras)
}

export interface LayoutConfig {
  version: number;
  grid: { cols: number; breakpoints: { minWidth: number; cols: number }[] };
  tabs: {
    home:     { visible: boolean; name: string; cameras?: string[] };
    security: { visible: boolean; name: string; cameras?: string[] };
    climate:  { visible: boolean; name: string; cameras?: string[] };
    media:    { visible: boolean; name: string; cameras?: string[] };
  };
  customTabs?: CustomTab[];
  rooms: RoomConfig[];
  security: {
    alarm: string;
    sensors: SensorConfig[];
    cameras: CameraConfig[];
    lock?: { entity: string; batteryEntity?: string };
    nasEntity?: string;
    doorbellEntity?: string;   // event or binary_sensor entity to watch for rings
    doorbellCamera?: string;   // camera entity to show on ring
  };
  status: {
    lights: string[];
    acs: string[];
    presence: string[];
    waterFilter?: string;
  };
  media: {
    players: MediaPlayerConfig[];
    apps: AppConfig[];
    tvRemote?: string;
    radioBoolean?: string;
  };
  chips: {
    alarm:    { visible: boolean };
    door:     { visible: boolean; entity: string; label: string };
    weather:  { visible: boolean; entity: string };
    prayer:   { visible: boolean; sensors: Record<string, string> };
    presence: { visible: boolean; persons: { entity: string; name: string }[] };
  };
  users: UserConfig[];
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  version: 1,
  grid: { cols: 4, breakpoints: [{ minWidth: 0, cols: 2 }, { minWidth: 768, cols: 3 }, { minWidth: 1100, cols: 4 }] },
  tabs: {
    home:     { visible: true, name: 'Home' },
    security: { visible: true, name: 'Security' },
    climate:  { visible: true, name: 'Climate' },
    media:    { visible: true, name: 'TV & Media' },
  },
  rooms: [
    { id:'lr', name:'Living Room',  icon:'🛋️', color:'blue',   visible:true, order:0,
      lights:['switch.livingroomswitch1_left','switch.livingroomswitch1_center','switch.livingroomswitch1_right','switch.livingroomswitch2_left','switch.livingroomswitch2_center','switch.livingroomswitch2_right','light.tv_led','light.yeelight_colorb_0x1b35f509'],
      ac:'climate.1e05049f', tv:'media_player.lg_webos_tv_uj670v', extras:[] },
    { id:'bd', name:'Bedroom',      icon:'🛏️', color:'purple', visible:true, order:1,
      lights:['switch.master_lights_left','switch.master_lights_center','switch.master_lights_right','switch.master_lights1_left','switch.master_lights1_center','switch.master_lights1_right','switch.master_bath_left','switch.master_bath_center','switch.master_bath_right'],
      ac:'climate.1e050116', extras:[] },
    { id:'kt', name:'Kitchen',      icon:'🍳', color:'amber',  visible:true, order:2,
      lights:['switch.kitchenlights_left','switch.kitchenlights_right','light.wled_2'], extras:[] },
    { id:'of', name:'Office',       icon:'💼', color:'cyan',   visible:true, order:3,
      lights:['switch.office_light_left','switch.office_light_right'],
      ac:'climate.1e51b62f', extras:[] },
    { id:'br', name:'Baby Room',    icon:'👶', color:'pink',   visible:true, order:4,
      lights:['switch.baby_room'], extras:[] },
    { id:'gr', name:'Guest Room',   icon:'🚪', color:'green',  visible:true, order:5,
      lights:['switch.guest_light_left','switch.guest_light_right','switch.guest_light_center'], extras:[] },
    { id:'hw', name:'Hallway',      icon:'🏠', color:'indigo', visible:true, order:6,
      lights:['switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right','switch.entrance_light_left','switch.entrance_light_right'], extras:[] },
    { id:'ln', name:'Laundry',      icon:'🧺', color:'rose',   visible:true, order:7,
      lights:['switch.laundry_light_left','switch.laundry_light_right'],
      ac:'climate.1e51bb2c', extras:[] },
  ],
  security: {
    alarm: 'alarm_control_panel.alarmo',
    sensors: [
      { id:'door', entity:'binary_sensor.maindoorsensor_contact',            label:'Main Door',      icon:'🚪', okState:'off', okLabel:'Closed', warnLabel:'Open'   },
      { id:'ent',  entity:'binary_sensor.entrance_motion_sensor_occupancy',  label:'Entrance Motion',icon:'🏃', okState:'off', okLabel:'Clear',  warnLabel:'Motion' },
      { id:'kit',  entity:'binary_sensor.kitchensensor_occupancy',           label:'Kitchen Motion', icon:'🍳', okState:'off', okLabel:'Clear',  warnLabel:'Motion' },
      { id:'stor', entity:'binary_sensor.storagemotionsensor_occupancy',     label:'Storage Motion', icon:'📦', okState:'off', okLabel:'Clear',  warnLabel:'Motion' },
    ],
    cameras: [
      { id:'doorbell', entity:'camera.g4_doorbell_pro_poe_high_resolution_channel', label:'G4 Doorbell',  streamType:'ha' },
      { id:'package',  entity:'camera.g4_doorbell_pro_poe_package_camera',          label:'Package Cam',  streamType:'ha' },
    ],
    lock: { entity:'lock.aqara_smart_lock_u200', batteryEntity:'sensor.aqara_smart_lock_u200_battery' },
    nasEntity: 'sensor.cloud_gateway_fiber_storage_utilization',
    doorbellEntity: 'event.g4_doorbell_pro_poe_doorbell',
    doorbellCamera: 'camera.g4_doorbell_pro_poe_high_resolution_channel',
  },
  status: {
    lights: [
      'switch.livingroomswitch1_left','switch.livingroomswitch1_center','switch.livingroomswitch1_right',
      'switch.livingroomswitch2_left','switch.livingroomswitch2_center','switch.livingroomswitch2_right',
      'light.tv_led','light.yeelight_colorb_0x1b35f509',
      'switch.kitchenlights_left','switch.kitchenlights_right','light.wled_2',
      'switch.master_lights_left','switch.master_lights_center','switch.master_lights_right',
      'switch.master_lights1_left','switch.master_lights1_center','switch.master_lights1_right',
      'switch.master_bath_left','switch.master_bath_center','switch.master_bath_right',
      'switch.office_light_left','switch.office_light_right',
      'switch.baby_room',
      'switch.guest_light_left','switch.guest_light_right','switch.guest_light_center',
      'switch.entrance_light_left','switch.entrance_light_right',
      'switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right',
      'switch.laundry_light_left','switch.laundry_light_right',
    ],
    acs: ['climate.1e05049f','climate.1e050116','climate.1e51b62f','climate.1e51bb2c'],
    presence: ['person.raed','person.rola'],
    waterFilter: 'switch.athom_smart_plug_v3_50b5b0_power',
  },
  media: {
    players: [
      { id:'tv',  entity:'media_player.lg_webos_tv_uj670v', label:'LG TV · Living Room', icon:'📺' },
      { id:'atv', entity:'media_player.appletv',            label:'Apple TV',             icon:'📱' },
      { id:'hp',  entity:'media_player.homepod_mini',       label:'HomePod Mini',         icon:'🍎' },
    ],
    apps: [
      { id:'nf', label:'Netflix',     icon:'netflix',  actionType:'input_button', entity:'input_button.netflix'  },
      { id:'yt', label:'YouTube',     icon:'youtube',  actionType:'input_button', entity:'input_button.youtube'  },
      { id:'sh', label:'Shahid',      icon:'shahid',   actionType:'input_button', entity:'input_button.shahid'   },
      { id:'px', label:'Plex',        icon:'plex',     actionType:'input_button', entity:'input_button.plex'     },
      { id:'st', label:'STC TV',      icon:'stctv',    actionType:'input_button', entity:'input_button.stc_tv'   },
      { id:'mk', label:'Radio',       icon:'radio',    actionType:'boolean',      entity:'input_boolean.radio_on_sw' },
      { id:'ml', label:'Movie Light', icon:'🎬',       actionType:'boolean',      entity:'input_boolean.movie_light' },
    ],
    tvRemote: 'media_player.lg_webos_tv_uj670v',
    radioBoolean: 'input_boolean.radio_on_sw',
  },
  chips: {
    alarm:   { visible: true },
    door:    { visible: true, entity: 'binary_sensor.maindoorsensor_contact', label: 'Door' },
    weather: { visible: true, entity: 'weather.forecast_home' },
    prayer:  { visible: true, sensors: {
      fajr:'sensor.islamic_prayer_times_fajr_prayer', dhuhr:'sensor.islamic_prayer_times_dhuhr_prayer',
      asr:'sensor.islamic_prayer_times_asr_prayer',   maghrib:'sensor.islamic_prayer_times_maghrib_prayer',
      isha:'sensor.islamic_prayer_times_isha_prayer',
    }},
    presence: { visible: true, persons: [{ entity:'person.raed', name:'Raed' }, { entity:'person.rola', name:'Rola' }] },
  },
  users: [],
};

let _layout: LayoutConfig | null = null;

export function loadLayout(): LayoutConfig {
  if (!existsSync(LAYOUT_FILE)) return _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as LayoutConfig;
  try {
    const raw = JSON.parse(readFileSync(LAYOUT_FILE, 'utf-8')) as LayoutConfig;
    // Migration: ensure every user has a username field
    if (raw.users) {
      raw.users = raw.users.map(u => ({
        ...u,
        username: u.username ?? u.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      }));
    }
    _layout = raw;
    return _layout;
  } catch {
    return _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as LayoutConfig;
  }
}

export function getLayout(): LayoutConfig {
  return _layout ?? loadLayout();
}

export function saveLayout(layout: LayoutConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2), { mode: 0o600 });
  _layout = layout;
}
