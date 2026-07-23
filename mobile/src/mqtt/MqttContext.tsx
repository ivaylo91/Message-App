import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { MQTT_WS_URL } from '../config/env';
import { useAuth } from '../auth/AuthContext';

type MessageHandler = (topic: string, payload: unknown) => void;

interface MqttContextValue {
  isConnected: boolean;
  subscribe: (topic: string, handler: MessageHandler) => () => void;
}

const MqttContext = createContext<MqttContextValue | undefined>(undefined);

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const clientRef = useRef<MqttClient | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      clientRef.current?.end(true);
      clientRef.current = null;
      setIsConnected(false);
      return;
    }

    const client = mqtt.connect(MQTT_WS_URL, {
      clientId: `mobile-${user.id}-${Date.now()}`,
      reconnectPeriod: 2000,
    });
    clientRef.current = client;

    client.on('connect', () => setIsConnected(true));
    client.on('close', () => setIsConnected(false));
    client.on('message', (topic, payload) => {
      const handlers = handlersRef.current.get(topic);
      if (!handlers) return;
      let parsed: unknown = payload.toString();
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        // not JSON, keep raw string
      }
      handlers.forEach((handler) => handler(topic, parsed));
    });

    return () => {
      client.end(true);
      clientRef.current = null;
      setIsConnected(false);
    };
  }, [user]);

  const subscribe = (topic: string, handler: MessageHandler) => {
    const client = clientRef.current;
    let handlers = handlersRef.current.get(topic);
    if (!handlers) {
      handlers = new Set();
      handlersRef.current.set(topic, handlers);
      client?.subscribe(topic);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
      if (handlers && handlers.size === 0) {
        handlersRef.current.delete(topic);
        client?.unsubscribe(topic);
      }
    };
  };

  return (
    <MqttContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </MqttContext.Provider>
  );
}

export function useMqtt(): MqttContextValue {
  const context = useContext(MqttContext);
  if (!context) {
    throw new Error('useMqtt must be used within an MqttProvider');
  }
  return context;
}
