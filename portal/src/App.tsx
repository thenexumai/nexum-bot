import React, { useState } from 'react';
import { Layout, Search, Monitor, Wallet, Book, Flame, Users, Settings, Cpu } from 'lucide-react';

const NEXUM_LOGO = "/NEXUM LOGO.PNG";

export default function App() {
  const [activeTab, setActiveTab] = useState('browser');

  return (
    <div className="flex h-screen bg-[#050507] text-white font-sans">
      {/* GLOBAL SIDEBAR */}
      <div className="w-20 flex flex-col items-center py-6 border-r border-[#1a1d27] bg-[#0a0a0f]">
        <img src={NEXUM_LOGO} className="w-10 h-10 mb-8" alt="NEXUM" />
        
        <div className="flex-1 flex flex-col gap-6">
          <NavItem icon={<Monitor />} active={activeTab === 'browser'} onClick={() => setActiveTab('browser')} />
          <NavItem icon={<Search />} active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <NavItem icon={<Wallet />} active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
          <NavItem icon={<Book />} active={activeTab === 'notes'} onClick={() => setActiveTab('notes')} />
          <NavItem icon={<Flame />} active={activeTab === 'habits'} onClick={() => setActiveTab('habits')} />
          <NavItem icon={<Users />} active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} />
        </div>

        <div className="mt-auto">
          <NavItem icon={<Settings />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'browser' && <BrowserPortal />}
        {/* Остальные компоненты рендерятся по аналогии */}
      </div>
    </div>
  );
}

function NavItem({ icon, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`p-3 rounded-xl transition-all ${active ? 'bg-[#6c63ff] shadow-[0_0_20px_rgba(108,99,255,0.4)]' : 'text-[#5c5f72] hover:text-white hover:bg-[#13131a]'}`}
    >
      {icon}
    </button>
  );
}

function BrowserPortal() {
  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-[#13131a] flex items-center px-6 gap-4 border-bottom border-[#1a1d27]">
          <div className="flex-1 bg-[#1c1c26] rounded-lg px-4 py-1.5 border border-[#2a2a38] text-sm text-[#9395a5]">
            https://google.com
          </div>
          <div className="flex gap-2 text-xs font-bold text-[#22d3a5]">
            <div className="w-2 h-2 rounded-full bg-[#22d3a5] animate-pulse"></div>
            PC AGENT LINKED
          </div>
        </div>
        <div className="flex-1 bg-black flex items-center justify-center">
          <p className="text-[#5c5f72]">Waiting for stream from Nexum Agent...</p>
        </div>
      </div>
      
      {/* SIDE AI PANEL (COMET STYLE) */}
      <div className="w-[400px] border-l border-[#1a1d27] bg-[#0a0a0f] p-6 flex flex-col">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Cpu className="text-[#6c63ff]" /> INTELLIGENCE
        </h2>
        <div className="flex-1 overflow-y-auto text-sm space-y-4">
          <div className="p-4 bg-[#13131a] rounded-lg border border-[#1a1d27]">
            Hello Timur. I am currently analyzing the current page. I can help you automate tasks or extract data.
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#1a1d27]">
          <textarea 
            className="w-full bg-[#1c1c26] border border-[#2a2a38] rounded-xl p-4 text-sm outline-none focus:border-[#6c63ff]"
            placeholder="Ask anything..."
            rows={3}
          ></textarea>
          <button className="w-full mt-3 bg-[#6c63ff] py-3 rounded-xl font-bold hover:opacity-90 transition-all">
            EXECUTE AI REASONING
          </button>
        </div>
      </div>
    </div>
  );
}
