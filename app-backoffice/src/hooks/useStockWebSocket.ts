import { useEffect, useRef, useState, useCallback } from 'react';
import { wsUrl } from '../api';

export interface StockAlert {
  id: string;
  level: 'warning' | 'danger';
  message: string;
  produit_id?: number;
  time: Date;
}

export interface StockUpdate {
  produit_id: number;
  stock: number;
  mouvement: string;
}

export interface NewSale {
  caisse: string;
  total: number;
  items: number;
}

interface UseStockWsReturn {
  connected: boolean;
  alerts: StockAlert[];
  lastUpdate: StockUpdate | null;
  lastSale: NewSale | null;
  clearAlerts: () => void;
}

export function useStockWebSocket(): UseStockWsReturn {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [lastUpdate, setLastUpdate] = useState<StockUpdate | null>(null);
  const [lastSale, setLastSale] = useState<NewSale | null>(null);
  const pingInterval = useRef<number | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(wsUrl('/ws/stock/'));

      socket.onopen = () => {
        setConnected(true);
        // Ping toutes les 30s pour garder la connexion
        pingInterval.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'stock_update':
              setLastUpdate({ produit_id: data.produit_id, stock: data.stock, mouvement: data.mouvement });
              break;
            case 'new_sale':
              setLastSale({ caisse: data.caisse, total: data.total, items: data.items });
              break;
            case 'alert':
              setAlerts(prev => [
                { id: crypto.randomUUID(), level: data.level, message: data.message, produit_id: data.produit_id, time: new Date() },
                ...prev.slice(0, 9),
              ]);
              break;
            case 'stock_snapshot':
              // Snapshot initial reçu à la connexion — utilisable si besoin
              break;
          }
        } catch { /* ignore */ }
      };

      socket.onclose = () => {
        setConnected(false);
        if (pingInterval.current) clearInterval(pingInterval.current);
        // Reconnexion automatique après 5s
        reconnectTimeout.current = window.setTimeout(() => connect(), 5000);
      };

      socket.onerror = () => { socket.close(); };
      ws.current = socket;
    } catch {
      // WebSocket non disponible (ex: API hors ligne) → silencieux
      reconnectTimeout.current = window.setTimeout(() => connect(), 10000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  return { connected, alerts, lastUpdate, lastSale, clearAlerts };
}
