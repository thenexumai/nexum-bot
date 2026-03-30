import React, { useState } from 'react';
import { Play, Shield, Globe, Cpu } from 'lucide-react';

export default function MissionDesigner() {
  const [objective, setObjective] = useState("");
  const [depth, setDepth] = useState(3);
  const [isDangerous, setIsDangerous] = useState(false);

  const startMission = async () => {
    console.log("Starting mission:", { objective, depth, isDangerous });
    // API call to /api/missions/create
  };

  return (
    <div className="p-8 bg-[#0a0a0f] rounded-2xl border border-[#1a1d27] max-w-2xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
        <Cpu className="text-[#6c63ff]" /> NEXUM MISSION DESIGNER
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-[#9395a5] mb-2">PRIMARY OBJECTIVE</label>
          <textarea 
            className="w-full bg-[#13131a] border border-[#2a2a38] rounded-xl p-4 text-white outline-none focus:border-[#6c63ff] transition-all"
            rows={4}
            placeholder="e.g. Find all potential investors for a new AI startup in Dubai and save their LinkedIn profiles to a JSON file."
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          ></textarea>
        </div>

        <div className="flex gap-8">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[#9395a5] mb-2">SEARCH DEPTH (1-5)</label>
            <input 
              type="range" min="1" max="5" 
              className="w-full h-2 bg-[#1c1c26] rounded-lg appearance-none cursor-pointer accent-[#6c63ff]"
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
            />
            <div className="text-right text-xs mt-1 text-[#5c5f72]">Level: {depth}</div>
          </div>

          <div className="w-48">
            <label className="block text-sm font-medium text-[#9395a5] mb-2">SAFETY MODE</label>
            <button 
              onClick={() => setIsDangerous(!isDangerous)}
              className={`w-full py-2 rounded-lg border transition-all flex items-center justify-center gap-2 text-xs font-bold ${isDangerous ? 'bg-red-900/20 border-red-500 text-red-500' : 'bg-green-900/20 border-green-500 text-green-500'}`}
            >
              <Shield size={14} /> {isDangerous ? 'UNRESTRICTED' : 'SECURE'}
            </button>
          </div>
        </div>

        <button 
          onClick={startMission}
          className="w-full py-4 bg-[#6c63ff] hover:bg-[#5a52e6] rounded-xl font-bold flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(108,99,255,0.3)] transition-all"
        >
          <Play fill="currentColor" /> INITIATE AUTONOMOUS MISSION
        </button>
      </div>
    </div>
  );
}
