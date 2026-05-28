import { useState, useEffect, useRef, useCallback } from 'react';
import type { HaEntity } from '../types/ha';

interface UseHAResult {
  entities: Record<string, HaEntity>;
  connected: boolean;
  callService: (domain: string, service: string, target: { entity_id: string }, serviceData?: Record<string, unknown>) => void;
}

let msgId = 1;

export function useHA(token: string | null): UseHAResult {
  const [entities, setEntities] = useState<Record<string, HaEntity>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const callService = useCallback((
    domain: string,
    service: string,
    target: { entity_id: string },
    serviceData: Record<string, unknown> = {},
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Optimistic update
    const entityId = target.entity_id;
    setEntities(prev => {
      const entity = prev[entityId];
      if (!entity) return prev;
      let optimisticState = entity.state;
      if (service === 'toggle') optimisticState = entity.state === 'on' ? 'off' : 'on';
      else if (service === 'turn_on') optimisticState = 'on';
      else if (service === 'turn_off') optimisticState = 'off';
      else if (service === 'lock') optimisticState = 'locked';
      else if (service === 'unlock') optimisticState = 'unlocked';
      return { ...prev, [entityId]: { ...entity, state: optimisticState } };
    });
    wsRef.current.send(JSON.stringify({
      id: msgId++,
      type: 'call_service',
      domain,
      service,
      target,
      service_data: serviceData,
    }));
  }, []);

  useEffect(() => {
    if (!token) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data) as Record<string, unknown>; }
      catch { return; }

      if (msg.type === 'auth_ok') {
        setConnected(true);
        ws.send(JSON.stringify({ id: msgId++, type: 'get_states' }));
        ws.send(JSON.stringify({ id: msgId++, type: 'subscribe_events', event_type: 'state_changed' }));
      }

      if (msg.type === 'result' && msg.success && Array.isArray(msg.result)) {
        const map: Record<string, HaEntity> = {};
        for (const e of msg.result as HaEntity[]) map[e.entity_id] = e;
        setEntities(map);
      }

      if (msg.type === 'event') {
        const ev = msg.event as { data?: { entity_id: string; new_state: HaEntity | null } };
        if (ev?.data?.new_state) {
          const { entity_id, new_state } = ev.data;
          setEntities(prev => ({ ...prev, [entity_id]: new_state }));
        }
      }
    };

    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onerror = () => { setConnected(false); };

    return () => { ws.close(); wsRef.current = null; };
  }, [token]);

  return { entities, connected, callService };
}
