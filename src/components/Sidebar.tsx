import React from 'react';
import { 
  LayoutDashboard, 
  Search, 
  ShieldAlert, 
  BellRing, 
  Users, 
  FileText, 
  Shield, 
  ChevronRight, 
  X 
} from 'lucide-react';
import { NavPage } from '../types';

export type { NavPage };

export interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  isOpenMobile?: boolean;
  onToggleMobile?: () => void;
  criticalAlertCount?: number;
}

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'search', label: 'Search Customers', icon: Search },
  { id: 'assessment', label: 'Risk Analysis', icon: ShieldAlert },
  { id: 'alerts', label: 'Early-Warning Alerts', icon: BellRing },
  { id: 'segmentation', label: 'Customer Groups', icon: Users },
  { id: 'reports', label: 'Risk Reports', icon: FileText },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isOpenMobile = false,
  onToggleMobile,
  criticalAlertCount = 0,
}) => {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onToggleMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#14213D] text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#159A8C] flex items-center justify-center text-white shadow-sm shadow-teal-900/30">
              <Shield className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                CreditGuard <span className="text-[#159A8C] text-xs font-semibold px-1.5 py-0.5 rounded-sm bg-[#159A8C]/20 border border-[#159A8C]/30">AI</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium tracking-wide">
                Credit Risk Intelligence
              </div>
            </div>
          </div>

          {onToggleMobile && (
            <button 
              onClick={onToggleMobile}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800/60 transition-colors"
              aria-label="Close navigation sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Risk Management
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  if (isOpenMobile && onToggleMobile) onToggleMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#159A8C] text-white shadow-sm shadow-[#159A8C]/30 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.id === 'alerts' && criticalAlertCount > 0 && (
                    <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      {criticalAlertCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info box */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-900/40 text-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-medium">Model Engine</span>
            <span className="font-mono text-[11px] text-[#159A8C]">
              model.pkl · v1.6
            </span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Gradient Boosting credit risk model active across 200 customer accounts.
          </div>
        </div>
      </aside>
    </>
  );
};
