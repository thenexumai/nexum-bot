import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, XCircle, Activity } from 'lucide-react';

export default function MissionDashboard({ uid }: { uid: number }) {
  const [missions, setMissions] = useState<any[]>([]);

  const fetchMissions = async () => {
    try {
      const res = await fetch(`/api/tasks?uid=${uid}`);
      const data = await res.json();
      // Фильтруем только миссии ИИ
      setMissions(data.filter((t: any) => t.title === 'AI Mission'));
    } catch (e) {
      console.error("Failed to fetch missions", e);
    }
  };

  useEffect(() => {
    fetchMissions();
    const interval = setInterval(fetchMissions, 5000); // Обновление каждые 5 сек
    return () => clearInterval(interval);
  }, [uid]);

  return (
    <div className="p-6 bg-[#050507] h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Activity className="text-[#6c63ff]" size={20} /> ACTIVE AI MISSIONS
      </h2>

      {missions.length === 0 ? (
        <div className="text-[#5c5f72] text-center mt-20">No active missions found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {missions.map(m => (
            <div key={m.id} className="bg-[#0a0a0f] border border-[#1a1d27] rounded-2xl p-5 hover:border-[#2a2a38] transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-width-0 mr-4">
                  <h3 className="font-bold text-[#fff] truncate">{m.description}</h3>
                  <p className="text-xs text-[#5c5f72]">Status: {m.status.toUpperCase()}</p>
                </div>
                <StatusIcon status={m.status} />
              </div>

              <div className="relative h-2 w-full bg-[#13131a] rounded-full overflow-hidden">
                <div 
                  className={`absolute top-0 left-0 h-full transition-all duration-500 ${m.status === 'completed' ? 'bg-[#22d3a5]' : 'bg-[#6c63ff]'}`}
                  style={{ width: `${m.progress}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-bold text-[#5c5f72] uppercase">ID: #{m.id}</span>
                <span className="text-[10px] font-bold text-[#9395a5]">{m.progress}% COMPLETE</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running') return <Clock className="text-[#fbbf24] animate-spin" size={18} />;
  if (status === 'completed') return <CheckCircle className="text-[#22d3a5]" size={18} />;
  if (status === 'failed') return <XCircle className="text-[#ff5a7e]" size={18} />;
  return <Clock className="text-[#5c5f72]" size={18} />;
}
