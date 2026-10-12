import React, { useState } from 'react';
import { User, Users, ChevronRight, LayoutDashboard, Sparkles } from 'lucide-react';
import { RiskConfig, NavPage } from '../types';
import { CustomerWiseDashboard } from './CustomerWiseDashboard';
import { SegmentWiseDashboard } from './SegmentWiseDashboard';

export interface DashboardProps {
  config: RiskConfig;
  onNavigate: (page: NavPage) => void;
  onSelectCustomer: (customerId: string) => void;
  selectedCustomerId?: string;
  defaultView?: 'customer' | 'segment';
}

export const Dashboard: React.FC<DashboardProps> = ({
  config,
  onNavigate,
  onSelectCustomer,
  selectedCustomerId,
  defaultView = 'customer',
}) => {
  const [activeTab, setActiveTab] = useState<'customer' | 'segment'>(defaultView);

  return (
    <div className="space-y-6">
      {/* Top View Switcher Navigation Bar */}
      <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
        <div className="flex items-center gap-3 pl-2">
          <div className="w-9 h-9 rounded-xl bg-[#14213D] text-white flex items-center justify-center font-bold text-sm">
            CG
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Credit Risk Dashboard Suite</h2>
            <p className="text-[11px] text-slate-500">Toggle between Individual Cardholder and Portfolio Segment analytics</p>
          </div>
        </div>

        {/* Tab Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveTab('customer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'customer'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Customer-Wise Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('segment')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'segment'
                ? 'bg-white text-emerald-700 shadow-xs border border-emerald-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Segment-Wise Dashboard</span>
          </button>
        </div>
      </div>

      {/* Render Active View */}
      {activeTab === 'customer' ? (
        <CustomerWiseDashboard
          selectedCustomerId={selectedCustomerId}
          config={config}
          onSelectCustomer={onSelectCustomer}
          onNavigate={onNavigate}
        />
      ) : (
        <SegmentWiseDashboard
          config={config}
          onSelectCustomer={onSelectCustomer}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
