import React, { useEffect, useState, useRef } from 'react';
import { MonitorOff, Monitor } from 'lucide-react';

export default function ScreenStream({ uid }: { uid: number }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Подключаемся к WebSocket серверу (Railway)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws.current = new WebSocket(`${protocol}//${host}?type=portal`);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'auth', uid }));
      setIsConnected(true);
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'screen_frame') {
        setFrame(msg.data);
      }
    };

    ws.current.onclose = () => setIsConnected(false);

    return () => ws.current?.close();
  }, [uid]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {frame ? (
        <img 
          src={`data:image/jpeg;base64,${frame}`} 
          className="max-w-full max-h-full object-contain"
          alt="PC Stream"
        />
      ) : (
        <div className="flex flex-col items-center gap-4 text-[#5c5f72]">
          {isConnected ? <Monitor size={48} className="animate-pulse" /> : <MonitorOff size={48} />}
          <p className="text-sm font-medium">
            {isConnected ? "Waiting for Agent Signal..." : "Connecting to Nexum Cloud..."}
          </p>
        </div>
      )}
      
      {/* Overlay Status */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold">
        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#22d3a5]' : 'bg-[#ff5a7e]'}`}></div>
        {isConnected ? "CLOUD TUNNEL ACTIVE" : "DISCONNECTED"}
      </div>
    </div>
  );
}
