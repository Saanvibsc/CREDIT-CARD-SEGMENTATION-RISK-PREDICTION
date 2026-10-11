import React, { useState, useEffect } from 'react';
import { Search, Bell, Menu, X, ArrowRight } from 'lucide-react';
import { NavPage } from './Sidebar';
import { Customer } from '../types';
import { api } from '../services/api';

interface TopNavProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onSelectCustomer: (customerId: string) => void;
  activeAlertCount: number;
}

const NAV_ITEMS: { id: NavPage; label: string }[] = [
  { id: 'dashboard', label: 'Portfolio' },
  { id: 'search', label: 'Registry' },
  { id: 'assessment', label: 'Analysis' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'segmentation', label: 'Segments' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

export const TopNav: React.FC<TopNavProps> = ({
  currentPage,
  onNavigate,
  onSelectCustomer,
  activeAlertCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuickResults, setShowQuickResults] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const apiConfig = api.getConfig();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      api.searchCustomers(searchQuery).then((results) => {
        setSearchResults(results.slice(0, 5));
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelect = (id: string) => {
    onSelectCustomer(id);
    onNavigate('assessment');
    setSearchQuery('');
    setShowQuickResults(false);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="border-b border-[#e5e7eb] bg-[#fdfcf9] sticky top-0 z-40 px-4 sm:px-8 lg:px-16 py-3.5 flex items-center justify-between">
      {/* Brand: Rotated diamond + CG.AI */}
      <div className="flex items-center gap-6">
        <button 
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-none group"
        >
          <div className="w-4 h-4 border-2 border-[#1a1a1a] rotate-45 transition-transform group-hover:rotate-90 duration-300" />
          <span className="mono font-bold text-sm tracking-tight text-[#1a1a1a]">
            CG.AI
          </span>
        </button>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6 lg:gap-8 ml-2">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`text-[11px] font-semibold tracking-wider uppercase transition-colors relative py-1 ${
                  isActive
                    ? 'text-[#4338ca]'
                    : 'text-[#6b7280] hover:text-[#1a1a1a]'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'alerts' && activeAlertCount > 0 && (
                  <span className="ml-1.5 mono text-[9px] px-1.5 py-0.2 rounded-xs bg-red-100 text-red-800 border border-red-200">
                    {activeAlertCount}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338ca]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Search + Desk Meta + Mobile Toggle */}
      <div className="flex items-center gap-4">
        {/* Quick Search */}
        <div className="relative w-36 sm:w-56 hidden sm:block">
          <div className="border-b-2 border-[#1a1a1a] flex items-center justify-between pb-1">
            <input
              type="text"
              placeholder="Search customer ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowQuickResults(true);
              }}
              onFocus={() => setShowQuickResults(true)}
              className="bg-transparent text-xs text-[#1a1a1a] placeholder-gray-400 outline-none w-full font-sans"
            />
            <span className="meta text-[9px] shrink-0 text-gray-400">FIND</span>
          </div>

          {/* Quick results dropdown */}
          {showQuickResults && searchQuery.trim().length > 0 && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-[#e5e7eb] shadow-md py-1 z-50">
              <div className="px-3 py-1.5 meta text-[9px] border-b border-[#e5e7eb]">
                Matching Cardholders ({searchResults.length})
              </div>
              {searchResults.length > 0 ? (
                searchResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c.id)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#fdfcf9] flex items-center justify-between transition-colors border-b border-gray-100 last:border-none"
                  >
                    <div>
                      <span className="mono font-bold text-[#1a1a1a]">{c.id}</span>
                      <span className="text-gray-500 ml-2">{c.fullName}</span>
                    </div>
                    <span className="meta text-[9px] text-[#4338ca]">{c.cardType}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  No records
                </div>
              )}
            </div>
          )}
        </div>

        {/* Engine mode status */}
        <button
          onClick={() => onNavigate('settings')}
          className="meta hidden lg:inline-block border border-[#e5e7eb] px-2 py-1 bg-white hover:border-[#4338ca] transition-colors"
          title="Engine Configuration"
        >
          {apiConfig.mode === 'live' ? 'LIVE BACKEND' : 'DEMO PROXY'}
        </button>

        {/* Direct Download ZIP for GitHub */}
        <a
          href="/creditguard-frontend.zip"
          download="creditguard-frontend.zip"
          className="meta hidden sm:inline-flex items-center gap-1 border border-[#1a1a1a] bg-[#1a1a1a] text-white px-2.5 py-1 hover:bg-[#4338ca] hover:border-[#4338ca] transition-colors"
          title="Download complete project ZIP to upload to GitHub"
        >
          <span>ZIP</span>
        </a>

        {/* Risk Officer Desk Meta */}
        <div className="meta hidden md:block text-[#6b7280]">
          Risk Officer Desk
        </div>

        {/* Mobile menu hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-1.5 text-[#1a1a1a] hover:text-[#4338ca]"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-[#fdfcf9] border-b border-[#e5e7eb] shadow-lg md:hidden p-4 space-y-3 z-50">
          <div className="border-b-2 border-[#1a1a1a] pb-1 flex items-center">
            <input
              type="text"
              placeholder="Search customer ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-[#1a1a1a] outline-none w-full font-sans"
            />
            <span className="meta">ENTER</span>
          </div>

          <div className="flex flex-col space-y-2 pt-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`text-left text-xs uppercase tracking-wider py-2 px-1 font-semibold flex items-center justify-between ${
                  currentPage === item.id ? 'text-[#4338ca] border-l-2 border-[#4338ca] pl-2' : 'text-gray-600'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'alerts' && activeAlertCount > 0 && (
                  <span className="mono text-[9px] px-1.5 py-0.5 bg-red-100 text-red-800">
                    {activeAlertCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};
