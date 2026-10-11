import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Search,
  RefreshCw
} from 'lucide-react';
import { Customer, CustomerSegment, RiskConfig } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface CustomerSegmentationProps {
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const CustomerSegmentation: React.FC<CustomerSegmentationProps> = ({
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [segments, setSegments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [activeSegmentFilter, setActiveSegmentFilter] = useState<'All' | CustomerSegment>('All');
  const [tableSearch, setTableSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSegmentation = async () => {
    setLoading(true);
    try {
      const data = await api.getSegmentationData();
      setSegments(data.segments);
      setCustomers(data.customers);
      setTotalCustomers(data.totalCustomers ?? data.customers.length);
    } catch (err) {
      console.error('Failed to fetch segmentation from API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSegmentation();
  }, []);

  const filteredCustomers = customers.filter((c) => {
    const matchesSegment = activeSegmentFilter === 'All' || c.segment === activeSegmentFilter;
    const matchesSearch =
      !tableSearch ||
      c.id.toLowerCase().includes(tableSearch.toLowerCase()) ||
      c.fullName.toLowerCase().includes(tableSearch.toLowerCase()) ||
      c.employerCategory.toLowerCase().includes(tableSearch.toLowerCase());
    return matchesSegment && matchesSearch;
  });

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Unsupervised Clustering — K=4 Centroids</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            Customer Segmentation
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSegmentation}
            className="p-1.5 border border-[#e5e7eb] hover:border-[#1a1a1a] transition-colors"
            title="Refresh clusters"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="meta border border-[#e5e7eb] px-3 py-1.5 bg-white">
            K-MEANS PREVIEW
          </div>
        </div>
      </header>

      {/* Cluster Distribution Share Bar */}
      <div className="space-y-3 pb-6 border-b border-[#e5e7eb]">
        <div className="flex items-center justify-between">
          <span className="meta">Portfolio Share Allocation</span>
          <span className="mono text-xs text-gray-500">
            Showing {customers.length.toLocaleString()} of {totalCustomers.toLocaleString()} clustered accounts
          </span>
        </div>

        {/* Minimalist Bar */}
        <div className="h-4 bg-gray-100 flex overflow-hidden border border-[#e5e7eb]">
          {segments.map((segment, index) => (
            <div
              key={segment.segment}
              style={{ width: `${segment.percentage}%` }}
              className={['bg-[#4338ca]', 'bg-[#1a1a1a]', 'bg-[#be123c]', 'bg-[#b45309]'][index % 4]}
              title={`${segment.name}: ${segment.percentage}%`}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 text-xs mono">
          {segments.map((segment, index) => (
            <div key={segment.segment} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 ${['bg-[#4338ca]', 'bg-[#1a1a1a]', 'bg-[#be123c]', 'bg-[#b45309]'][index % 4]}`} />
              <span>{segment.name} ({segment.percentage}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Deep Segment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {segments.map((seg, idx) => {
          const isFiltered = activeSegmentFilter === seg.segment;
          return (
            <div
              key={seg.segment}
              className={`bg-white border p-6 sm:p-8 space-y-4 flex flex-col justify-between transition-all ${
                isFiltered ? 'border-[#4338ca] shadow-xs' : 'border-[#e5e7eb] hover:border-[#1a1a1a]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] pb-3">
                  <div>
                    <span className="meta">Cohort 0{idx + 1}</span>
                    <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] mt-0.5">
                      {seg.name}
                    </h3>
                    <p className="meta text-[#4338ca] mt-0.5">{seg.tagline}</p>
                  </div>

                  <span className="mono text-xs font-bold border border-[#e5e7eb] px-2 py-1 bg-[#fdfcf9]">
                    {seg.percentage}%
                  </span>
                </div>

                <p className="text-xs text-[#6b7280] leading-relaxed my-4">
                  {seg.description}
                </p>

                <div className="grid grid-cols-3 gap-4 py-3 border-y border-[#e5e7eb] text-xs">
                  <div>
                    <span className="meta">Avg Util</span>
                    <div className="mono font-bold text-[#1a1a1a] mt-0.5">{seg.avgUtilization}%</div>
                  </div>
                  <div>
                    <span className="meta">Avg Bal</span>
                    <div className="mono font-bold text-[#1a1a1a] mt-0.5">${(seg.avgBalance / 1000).toFixed(1)}k</div>
                  </div>
                  <div>
                    <span className="meta">Default</span>
                    <div className="mono font-bold text-[#1a1a1a] mt-0.5">{seg.defaultRate}%</div>
                  </div>
                </div>

                <div className="p-3 bg-[#fdfcf9] border border-[#e5e7eb] text-xs text-[#1a1a1a] mt-4 leading-relaxed">
                  <span className="meta text-[#4338ca] block mb-0.5">Underwriting Protocol:</span>
                  {seg.recommendedStrategy}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-[#e5e7eb]">
                <button
                  onClick={() =>
                    setActiveSegmentFilter(isFiltered ? 'All' : seg.segment)
                  }
                  className={`mono text-xs uppercase tracking-wider py-1.5 px-3 border transition-colors ${
                    isFiltered
                      ? 'bg-[#4338ca] text-white border-[#4338ca]'
                      : 'border-[#1a1a1a] hover:border-[#4338ca] text-[#1a1a1a]'
                  }`}
                >
                  {isFiltered ? 'Filtered in Ledger ✓' : 'Filter Ledger Below'}
                </button>

                <span className="meta">
                  {seg.count.toLocaleString()} accounts
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Cluster Assignment Ledger */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1a1a1a]">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-[#1a1a1a]">
              Cluster Assignment Ledger
            </h2>
            <span className="meta">
              {activeSegmentFilter === 'All' ? 'All Cohorts' : `Filtered: ${activeSegmentFilter}`} ({filteredCustomers.length} accounts)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="border-b border-[#1a1a1a] pb-1">
              <input
                type="text"
                placeholder="Search ledger..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="bg-transparent outline-none text-xs font-sans text-[#1a1a1a] placeholder-gray-400"
              />
            </div>

            {activeSegmentFilter !== 'All' && (
              <button
                onClick={() => setActiveSegmentFilter('All')}
                className="meta text-[#4338ca] hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#fdfcf9] z-10">
              <tr className="border-b-2 border-[#1a1a1a]">
                <th className="py-2.5 px-2 meta">ID / Customer</th>
                <th className="py-2.5 px-2 meta">Cluster Assignment</th>
                <th className="py-2.5 px-2 meta text-right">Limit</th>
                <th className="py-2.5 px-2 meta text-right">Balance</th>
                <th className="py-2.5 px-2 meta text-right">Utilisation</th>
                <th className="py-2.5 px-2 meta text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-white transition-colors">
                  <td className="py-3 px-2">
                    <span className="mono font-bold text-[#1a1a1a]">{c.id}</span>
                    <span className="block text-[11px] text-gray-500 font-sans">{c.fullName}</span>
                  </td>
                  <td className="py-3 px-2 font-medium text-[#1a1a1a]">
                    {c.segment}
                  </td>
                  <td className="py-3 px-2 mono text-right text-gray-600">
                    ${c.creditLimit.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-2 mono text-right font-bold text-[#1a1a1a]">
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
                      Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
