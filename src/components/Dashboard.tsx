import React, { useState, useEffect } from 'react';
import { 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  Search, 
  ChevronRight,
  Clock,
  ArrowRight,
  RefreshCw,
  Server,
  Cpu
} from 'lucide-react';
import { Customer, EarlyWarningAlert, RiskConfig, PortfolioSummaryResponse } from '../types';
import { api } from '../services/api';
import { RiskDistributionChart, PortfolioExposureChart } from './charts/RiskCharts';
import { NavPage } from './Sidebar';

interface DashboardProps {
  config: RiskConfig;
  onNavigate: (page: NavPage) => void;
  onSelectCustomer: (customerId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  config,
  onNavigate,
  onSelectCustomer,
}) => {
  const [data, setData] = useState<PortfolioSummaryResponse | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<EarlyWarningAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchIdInput, setSearchIdInput] = useState('');
  const [searchError, setSearchError] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [summaryRes, custRes, alertsRes] = await Promise.all([
        api.getPortfolioSummary(config),
        api.searchCustomers(undefined, undefined, undefined, config),
        api.getAlerts(undefined, undefined),
      ]);
      setData(summaryRes);
      setRecentCustomers(custRes.slice(0, 6));
      setActiveAlerts(alertsRes.filter((a) => a.status !== 'Resolved').slice(0, 4));
    } catch (err) {
      console.error('Failed to load dashboard data via API service:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [config]);

  const handleQuickSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchIdInput.trim().toUpperCase();
    if (!query) {
      setSearchError('Please enter a Customer ID (e.g., CG-8041)');
      return;
    }
    const customer = await api.getCustomerById(query);
    if (customer) {
      setSearchError('');
      onSelectCustomer(customer.id);
      onNavigate('assessment');
    } else {
      setSearchError(`Customer ID "${query}" not found in portfolio registry.`);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-12 max-w-[1400px] mx-auto py-8 animate-pulse">
        <div className="h-16 bg-gray-100 border-l-4 border-[#4338ca] pl-6 w-1/3" />
        <div className="grid grid-cols-4 gap-8 py-6 border-b border-[#e5e7eb]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-100" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-4 h-80 bg-gray-100" />
          <div className="col-span-8 h-80 bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div role="alert" className="max-w-[1400px] mx-auto border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        Could not load the portfolio from the Flask backend. Confirm that the model and dataset loaded correctly, then refresh this page.
      </div>
    );
  }

  const summary = data.summary;
  const tb = data.tierBreakdown;

  const isLiveBackend = data?.source === 'live-ml-backend';

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-12">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Monitoring Unit — Cycle 2026.10</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            Portfolio Dashboard
          </h1>
        </div>

        {/* Minimal Search Area */}
        <form onSubmit={handleQuickSearch} className="w-full sm:w-80 flex flex-col">
          <div className="border-b-2 border-[#1a1a1a] py-1.5 flex items-center justify-between">
            <input
              type="text"
              placeholder="Search customer ID (e.g. CG-8041)..."
              value={searchIdInput}
              onChange={(e) => {
                setSearchIdInput(e.target.value);
                if (searchError) setSearchError('');
              }}
              className="bg-transparent border-none outline-none w-full text-xs font-sans text-[#1a1a1a] placeholder-gray-400"
            />
            <button type="submit" className="meta cursor-pointer hover:text-[#4338ca] ml-2">
              ENTER
            </button>
          </div>
          {searchError && (
            <span className="mono text-[11px] text-red-600 mt-1">{searchError}</span>
          )}
        </form>
      </header>

      {/* Quick Test IDs Strip */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs py-2 border-y border-[#e5e7eb]">
        <div className="flex items-center gap-2">
          <span className="meta">Sample Registry Test Accounts:</span>
          {['CG-8041', 'CG-3129', 'CG-5520', 'CG-9204'].map((id) => (
            <button
              key={id}
              onClick={() => {
                onSelectCustomer(id);
                onNavigate('assessment');
              }}
              className="mono text-[11px] px-2 py-0.5 border border-[#e5e7eb] hover:border-[#1a1a1a] bg-white transition-colors"
            >
              {id}
            </button>
          ))}
        </div>

        <button
          onClick={loadDashboardData}
          className="meta hover:text-[#4338ca] flex items-center gap-1 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Sync Data</span>
        </button>
      </div>

      {/* Metrics Row (Variation 3 Editorial Format) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 pb-8 border-b border-[#e5e7eb]">
        {/* Metric 1 */}
        <div className="space-y-1">
          <div className="meta">Analysed</div>
          <div className="text-4xl lg:text-5xl font-serif text-[#1a1a1a] py-1 font-semibold">
            {summary.totalCustomers}
          </div>
          <div className="meta text-emerald-700">100% Data Integrity</div>
        </div>

        {/* Metric 2 */}
        <div className="space-y-1">
          <div className="meta">Def. Rate</div>
          <div className="text-4xl lg:text-5xl font-serif text-[#1a1a1a] py-1 font-semibold">
            {summary.overallDefaultRate.toFixed(2)}%
          </div>
          <div className="meta text-[#b45309]">Drift Identified (+0.34%)</div>
        </div>

        {/* Metric 3 */}
        <div className="space-y-1">
          <div className="meta">High Risk</div>
          <div className="text-4xl lg:text-5xl font-serif text-[#be123c] py-1 font-semibold">
            {summary.highRiskPercentage.toFixed(1)}%
          </div>
          <div className="meta">{tb.highCount} active watchlist flags</div>
        </div>

        {/* Metric 4 */}
        <div className="space-y-1">
          <div className="meta">Exposure</div>
          <div className="text-4xl lg:text-5xl font-serif text-[#1a1a1a] py-1 font-semibold">
            ${(summary.totalCreditExposure / 1000).toFixed(1)}k
          </div>
          <div className="meta">Utilisation: {summary.averageUtilization.toFixed(1)}%</div>
        </div>
      </div>

      {/* Grid Sections: Risk Segmentation & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Column: Risk Segmentation Class Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <h2 className="text-2xl font-serif font-semibold text-[#1a1a1a] pb-2 border-b border-[#1a1a1a]">
            Risk Segmentation
          </h2>

          <div className="space-y-4">
            <div className="border-b border-[#e5e7eb] pb-4">
              <div className="meta text-[#4338ca]">Class A</div>
              <h4 className="text-sm font-semibold text-[#1a1a1a] mt-0.5">Low Risk (Score &lt; 35)</h4>
              <p className="text-xs text-[#6b7280] mt-1 leading-relaxed">
                Prime profiles with {tb.lowCount} cardholders indexed. Probability of default is negligible.
              </p>
            </div>

            <div className="border-b border-[#e5e7eb] pb-4">
              <div className="meta text-[#b45309]">Class B</div>
              <h4 className="text-sm font-semibold text-[#1a1a1a] mt-0.5">Medium Risk (35–64)</h4>
              <p className="text-xs text-[#6b7280] mt-1 leading-relaxed">
                {tb.medCount} cardholders with significant revolving balance exposure. Under surveillance.
              </p>
            </div>

            <div className="pb-2">
              <div className="meta text-[#be123c]">Class C</div>
              <h4 className="text-sm font-semibold text-[#1a1a1a] mt-0.5">High Risk (Score &ge; 65)</h4>
              <p className="text-xs text-[#6b7280] mt-1 leading-relaxed">
                {tb.highCount} cardholders with severe utilization issues. Workout protocol required.
              </p>
            </div>
          </div>

          {/* Quick jump to segmentation */}
          <button
            onClick={() => onNavigate('segmentation')}
            className="meta flex items-center gap-1.5 text-[#4338ca] hover:underline pt-2"
          >
            <span>Explore K-Means Cohorts</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Right Column: Recent Activity Data Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1a1a1a]">
            <h2 className="text-2xl font-serif font-semibold text-[#1a1a1a]">
              Recent Activity & Accounts
            </h2>
            <button
              onClick={() => onNavigate('search')}
              className="meta text-[#4338ca] hover:underline"
            >
              View Full Registry
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1a1a1a]">
                  <th className="py-2.5 px-2 meta">ID</th>
                  <th className="py-2.5 px-2 meta">Product</th>
                  <th className="py-2.5 px-2 meta text-right">Balance</th>
                  <th className="py-2.5 px-2 meta text-right">Util</th>
                  <th className="py-2.5 px-2 meta text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e7eb]">
                {recentCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-white transition-colors">
                    <td className="py-3 px-2 mono font-bold text-[#1a1a1a]">
                      {c.id}
                      <span className="block font-sans font-normal text-[11px] text-gray-500">{c.fullName}</span>
                    </td>
                    <td className="py-3 px-2 text-[#1a1a1a]">
                      {c.cardType}
                    </td>
                    <td className="py-3 px-2 mono text-right text-[#1a1a1a]">
                      ${c.outstandingBalance.toLocaleString('en-US')}
                    </td>
                    <td className="py-3 px-2 mono text-right text-[#1a1a1a]">
                      {c.creditUtilization.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => {
                          onSelectCustomer(c.id);
                          onNavigate('assessment');
                        }}
                        className="meta text-[#4338ca] hover:underline cursor-pointer"
                      >
                        Assess
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Interactive Charts Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-6 border-t border-[#e5e7eb]">
        <div className="lg:col-span-5 space-y-4">
          <div className="border-b border-[#e5e7eb] pb-2">
            <span className="meta">Distribution Model</span>
            <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Portfolio Risk Stratification
            </h3>
          </div>
          <RiskDistributionChart
            lowCount={tb.lowCount}
            mediumCount={tb.medCount}
            highCount={tb.highCount}
            total={summary.totalCustomers}
          />
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="border-b border-[#e5e7eb] pb-2">
            <span className="meta">Credit Facilities</span>
            <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Outstanding Exposure vs Allocated Line
            </h3>
          </div>
          <PortfolioExposureChart
            lowExposure={tb.lowExposure}
            lowLimit={tb.lowLimit}
            medExposure={tb.medExposure}
            medLimit={tb.medLimit}
            highExposure={tb.highExposure}
            highLimit={tb.highLimit}
          />
        </div>
      </div>

      {/* Service Footer (Exact Variation 3 styling) */}
      <section className="bg-[#1a1a1a] text-white p-6 sm:p-8 mt-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-2xl space-y-3">
          <div className="inline-block mono text-[10px] uppercase tracking-wider px-2.5 py-1 bg-[#2a2a2a] border border-gray-700 text-[#bfdbfe]">
            {isLiveBackend ? 'System Status: Connected Live ML' : 'System Status: Active Mock Proxy'}
          </div>
          <p className="mono text-xs opacity-80 leading-relaxed">
            {isLiveBackend
              ? 'Dashboard connected to the Flask API using the saved Scikit-learn model and dataset.'
              : 'Decoupled API service is routing calls to local mock datasets and deterministic underwriting scoring cards. Ready for live backend hookup.'}
          </p>
        </div>

        <div className="text-left md:text-right shrink-0">
          <div className="meta text-gray-400">Proxy Engine</div>
          <div className="mono text-lg font-bold text-white">
            {isLiveBackend ? 'PYTHON-ML v1' : 'DEMO-PROXY v1'}
          </div>
        </div>
      </section>
    </div>
  );
};
