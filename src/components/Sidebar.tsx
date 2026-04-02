import React from 'react';

interface SidebarProps {
  currentView: string;
  isCollapsed: boolean;
  onNavigate: (view: string) => void;
  onToggle: () => void;
}

export default function Sidebar({ currentView, isCollapsed, onNavigate, onToggle }: SidebarProps) {
  const navItems = [
    {
      id: 'discover',
      label: 'Discover',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      id: 'library',
      label: 'My Library',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    {
      id: 'highlights',
      label: 'Highlights',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    }
  ];

  return (
    <aside className={`bg-[#070b13] border-gray-800 transition-all duration-300 ease-in-out
      fixed bottom-0 left-0 right-0 h-16 border-t flex flex-row items-center px-2 z-50
      md:relative md:h-screen md:border-t-0 md:border-r md:flex-col md:items-stretch md:pt-8 md:pb-6 md:px-4
      ${isCollapsed ? 'md:w-20' : 'md:w-64'}
    `}>
      {/* Brand / Logo */}
      <div className={`hidden md:flex items-center gap-3 px-4 mb-10 overflow-hidden whitespace-nowrap transition-all duration-300
        ${isCollapsed ? 'opacity-0' : 'opacity-100'}
      `}>
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
          B
        </div>
        <h1 className="text-xl font-bold text-white tracking-wide">BOKU</h1>
      </div>

      {/* Toggle Button */}
      <button 
        onClick={onToggle}
        className="hidden md:flex absolute top-8 -right-3 w-6 h-6 bg-gray-800 border border-gray-700 rounded-full items-center justify-center text-gray-400 hover:text-white transition-colors z-50 overflow-hidden"
      >
        <svg 
          className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} 
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-row items-center justify-around h-full md:flex-col md:justify-start md:h-auto md:space-y-2 md:items-stretch">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={isCollapsed ? item.label : ''}
            className={`flex items-center gap-1 md:gap-4 px-2 py-2 md:px-4 md:py-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm overflow-hidden whitespace-nowrap
              ${currentView === item.id 
                ? 'bg-blue-600/10 text-blue-500' // active state
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200' // inactive state
              }
              ${isCollapsed ? 'md:justify-center md:px-0' : ''}
              flex-col md:flex-row flex-1 md:flex-none justify-center md:justify-start h-full md:h-auto w-auto md:w-full
            `}
          >
            <div className="shrink-0">{item.icon}</div>
            <span className={`block md:hidden ${isCollapsed ? 'hidden' : ''}`}>{item.label}</span>
            <span className={`hidden md:block ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="flex justify-center md:justify-start md:mt-2 md:space-y-2 md:pt-6 md:border-t md:border-gray-800 h-full md:h-auto items-center">
        <button 
          onClick={() => onNavigate('settings')}
          title={isCollapsed ? 'Settings' : ''}
          className={`flex items-center gap-1 md:gap-4 px-2 py-2 md:px-4 md:py-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm overflow-hidden whitespace-nowrap
            ${currentView === 'settings' 
              ? 'bg-blue-600/10 text-blue-500'
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}
            ${isCollapsed ? 'md:justify-center md:px-0' : ''}
            flex-col md:flex-row flex-1 md:flex-none justify-center md:justify-start h-full md:h-auto w-auto md:w-full
          `}
        >
          <div className="shrink-0 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className={`block md:hidden ${isCollapsed ? 'hidden' : ''}`}>Settings</span>
          <span className={`hidden md:block ${isCollapsed ? 'md:hidden' : ''}`}>Settings</span>
        </button>
      </div>
    </aside>
  );
}
