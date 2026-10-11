import React, { useState, useEffect } from 'react';
import { 
  Check, 
  RotateCcw, 
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { EarlyWarningAlert, AlertSeverity, AlertStatus } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface EarlyWarningAlertsProps {
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
  onAlertsCountChange?: (count: number) => void;
}

export const EarlyWarningAlerts: React.FC<EarlyWarningAlertsProps> = ({
  onSelectCustomer,
  onNavigate,
  onAlertsCountChange,
}) => {
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'All' | AlertSeverity>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | AlertStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getAlerts(severityFilter, statusFilter);
      setAlerts(data);
      if (onAlertsCountChange) {
        const crit = data.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length;
        onAlertsCountChange(crit);
      }
    } catch (err) {
      console.error('Failed to fetch alerts from API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [severityFilter, statusFilter]);

  const handleStatusChange = async (alertId: string, newStatus: AlertStatus) => {
    try {
      const updated = await api.updateAlertStatus(alertId, newStatus);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
      if (onAlertsCountChange) {
        const remaining = alerts.filter(
          (a) => a.id !== alertId && a.severity === 'Critical' && a.status !== 'Resolved'
        ).length + (updated.severity === 'Critical' && updated.status !== 'Resolved' ? 1 : 0);
        onAlertsCountChange(remaining);
      }
    } catch (err) {
      console.error('Failed to update alert status via API:', err);
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      alert.customerId.toLowerCase().includes(q) ||
      alert.customerName.toLowerCase().includes(q) ||
      alert.triggerReason.toLowerCase().includes(q)
    );
  });

  const criticalCount = alerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length;
  const underReviewCount = alerts.filter((a) => a.status === 'Under Review').length;
  const resolvedCount = alerts.filter((a) => a.status === 'Resolved').length;

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Automated Risk Watchlist</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            Early-Warning Alerts
          </h1>
          <p className="text-xs text-gray-500 font-sans mt-1">
            Catch credit risk early: accounts flagged for high card usage, late payments, or paying less than the minimum.
          </p>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center gap-4 text-xs">
          <div className="border-b-2 border-[#be123c] pb-1">
            <span className="meta text-[#be123c]">Urgent (Critical)</span>
            <div className="mono font-bold text-lg text-[#1a1a1a]">{criticalCount}</div>
          </div>
          <div className="border-b-2 border-[#b45309] pb-1">
            <span className="meta text-[#b45309]">Under Review</span>
            <div className="mono font-bold text-lg text-[#1a1a1a]">{underReviewCount}</div>
          </div>
          <div className="border-b-2 border-emerald-700 pb-1">
            <span className="meta text-emerald-700">Resolved</span>
            <div className="mono font-bold text-lg text-[#1a1a1a]">{resolvedCount}</div>
          </div>
        </div>
      </header>

      {/* Filter and Query Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-y border-[#e5e7eb] text-xs">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="border-b border-[#1a1a1a] pb-1 w-full">
            <input
              type="text"
              placeholder="Search by customer ID, name, or warning reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none w-full text-xs font-sans text-[#1a1a1a] placeholder-gray-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-white border border-[#e5e7eb] py-1.5 px-3 text-xs mono text-[#1a1a1a] outline-none"
          >
            <option value="All">All Urgency Levels</option>
            <option value="Critical">Critical (Urgent)</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-[#e5e7eb] py-1.5 px-3 text-xs mono text-[#1a1a1a] outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="New">Status: New Alert</option>
            <option value="Under Review">Status: Being Reviewed</option>
            <option value="Resolved">Status: Resolved</option>
          </select>

          <button
            onClick={fetchAlerts}
            className="p-1.5 border border-[#e5e7eb] hover:border-[#1a1a1a] transition-colors"
            title="Refresh alerts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts Ledger Table */}
      <div className="space-y-3">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => {
            const isResolved = alert.status === 'Resolved';
            return (
              <div
                key={alert.id}
                className={`border p-5 transition-all ${
                  isResolved
                    ? 'border-[#e5e7eb] bg-gray-50/50 opacity-70'
                    : alert.severity === 'Critical'
                    ? 'border-[#be123c] bg-white'
                    : 'border-[#e5e7eb] bg-white'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Left Column */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => {
                          onSelectCustomer(alert.customerId);
                          onNavigate('assessment');
                        }}
                        className="mono font-bold text-sm text-[#1a1a1a] hover:text-[#4338ca] transition-colors"
                      >
                        {alert.customerId}
                      </button>
                      <span className="font-sans font-semibold text-xs text-[#1a1a1a]">
                        {alert.customerName}
                      </span>
                      <span className={`mono text-[10px] px-1.5 py-0.5 border ${
                        alert.severity === 'Critical'
                          ? 'border-[#be123c] text-[#be123c] bg-rose-50'
                          : alert.severity === 'High'
                          ? 'border-[#b45309] text-[#b45309] bg-amber-50'
                          : 'border-gray-300 text-gray-700 bg-gray-50'
                      }`}>
                        {alert.severity}
                      </span>

                      <span className="meta text-gray-400">
                        STATUS: {alert.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-sm font-serif font-semibold text-[#1a1a1a]">
                      {alert.triggerReason}
                    </div>

                    <div className="mono text-[11px] text-gray-500 flex items-center gap-3">
                      <span>Trigger Details: <strong className="text-[#1a1a1a]">{alert.metricValue}</strong></span>
                      <span>·</span>
                      <span>Detected: {alert.detectedDate}</span>
                      {alert.reviewedBy && (
                        <>
                          <span>·</span>
                          <span>Reviewed: {alert.reviewedBy}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Recommended Action & Controls */}
                  <div className="lg:max-w-md w-full space-y-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#e5e7eb]">
                    <div className="p-3 bg-[#fdfcf9] border border-[#e5e7eb] text-xs leading-relaxed">
                      <span className="meta text-[#4338ca] block mb-0.5">Recommended Action:</span>
                      <span className="text-[#1a1a1a]">{alert.suggestedAction}</span>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      {alert.status !== 'Under Review' && alert.status !== 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Under Review')}
                          className="mono text-xs px-2.5 py-1 border border-[#e5e7eb] hover:border-[#1a1a1a] bg-white transition-colors cursor-pointer"
                        >
                          Review
                        </button>
                      )}

                      {alert.status !== 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Resolved')}
                          className="mono text-xs px-2.5 py-1 border border-emerald-700 bg-emerald-50 text-emerald-800 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Resolve</span>
                        </button>
                      )}

                      {alert.status === 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Under Review')}
                          className="mono text-xs px-2.5 py-1 border border-gray-300 bg-white transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reopen</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onSelectCustomer(alert.customerId);
                          onNavigate('assessment');
                        }}
                        className="mono text-xs px-3 py-1 bg-[#1a1a1a] hover:bg-[#4338ca] text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Profile</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center meta text-gray-400 border border-[#e5e7eb] bg-white">
            No active early-warning flags match the current filter criteria.
          </div>
        )}
      </div>
    </div>
  );
};
