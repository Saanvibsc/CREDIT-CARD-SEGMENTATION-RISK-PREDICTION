import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Customer, EarlyWarningAlert, RiskConfig, RiskTier } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface DashboardProps {
  config: RiskConfig;
  onNavigate: (page: NavPage) => void;
  onSelectCustomer: (customerId: string) => void;
}

type TierFilter = 'All' | RiskTier;
type UtilizationFilter = 'All' | '0-30' | '31-60' | '61-80' | '80+';

const TIER_ORDER: RiskTier[] = ['Low', 'Medium', 'High'];
const TIER_COLORS: Record<RiskTier, string> = {
  Low: '#4338ca',
  Medium: '#b45309',
  High: '#be123c',
};

const currency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

const matchesUtilization = (customer: Customer, range: UtilizationFilter) => {
  if (range === 'All') return true;
  if (range === '0-30') return customer.creditUtilization <= 30;
  if (range === '31-60') return customer.creditUtilization > 30 && customer.creditUtilization <= 60;
  if (range === '61-80') return customer.creditUtilization > 60 && customer.creditUtilization <= 80;
  return customer.creditUtilization > 80;
};

const selectClassName =
  'min-w-0 border border-[#e5e7eb] bg-white px-3 py-2.5 text-xs text-[#1a1a1a] outline-none transition focus:border-[#4338ca]';

export const Dashboard: React.FC<DashboardProps> = ({
  config,
  onNavigate,
  onSelectCustomer,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tierById, setTierById] = useState<Record<string, RiskTier>>({});
  const [activeAlerts, setActiveAlerts] = useState<EarlyWarningAlert[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [tierFilter, setTierFilter] = useState<TierFilter>('All');
  const [cardFilter, setCardFilter] = useState('All');
  const [utilizationFilter, setUtilizationFilter] = useState<UtilizationFilter>('All');
  const [searchIdInput, setSearchIdInput] = useState('');
  const [searchError, setSearchError] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [summary, ...tierResults] = await Promise.all([
        api.getPortfolioSummary(config),
        ...TIER_ORDER.map((tier) => api.searchCustomers(undefined, tier, undefined, config)),
      ]);
      const assignments: Record<string, RiskTier> = {};
      tierResults.forEach((records: Customer[], index) => {
        records.forEach((customer) => {
          assignments[customer.id] = TIER_ORDER[index];
        });
      });
      const records = Array.from(
        new Map(tierResults.flat().map((customer: Customer) => [customer.id, customer])).values(),
      ) as Customer[];

      setCustomers(records);
      setTierById(assignments);
      setSource(summary.source || 'demo-proxy');

      const alerts = await api.getAlerts();
      setActiveAlerts(
        alerts.filter((alert: EarlyWarningAlert) => alert.status !== 'Resolved').slice(0, 4),
      );
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load portfolio records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, [config]);

  const segments = useMemo(
    () => Array.from(new Set(customers.map((customer) => customer.segment).filter(Boolean))).sort(),
    [customers],
  );
  const cardTypes = useMemo(
    () => Array.from(new Set(customers.map((customer) => customer.cardType).filter(Boolean))).sort(),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customers.filter((customer) => {
      const tier = tierById[customer.id];
      const matchesSegment = segmentFilter === 'All' || customer.segment === segmentFilter;
      const matchesTier = tierFilter === 'All' || tier === tierFilter;
      const matchesCard = cardFilter === 'All' || customer.cardType === cardFilter;
      const matchesSearch =
        !query ||
        customer.id.toLowerCase().includes(query) ||
        customer.fullName.toLowerCase().includes(query);
      return (
        matchesSegment &&
        matchesTier &&
        matchesCard &&
        matchesSearch &&
        matchesUtilization(customer, utilizationFilter)
      );
    });
  }, [customers, tierById, segmentFilter, tierFilter, cardFilter, searchQuery, utilizationFilter]);

  const totals = useMemo(() => {
    const creditLimit = filteredCustomers.reduce((sum, customer) => sum + customer.creditLimit, 0);
    const balance = filteredCustomers.reduce(
      (sum, customer) => sum + customer.outstandingBalance,
      0,
    );
    const highRiskCount = filteredCustomers.filter(
      (customer) => tierById[customer.id] === 'High',
    ).length;
    return {
      accountCount: filteredCustomers.length,
      creditLimit,
      balance,
      utilization: creditLimit > 0 ? (balance / creditLimit) * 100 : 0,
      highRiskShare: filteredCustomers.length ? (highRiskCount / filteredCustomers.length) * 100 : 0,
    };
  }, [filteredCustomers, tierById]);

  const segmentStats = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; count: number; balance: number; limit: number; tiers: Record<RiskTier, number> }
    >();
    filteredCustomers.forEach((customer) => {
      const name = customer.segment || 'Unassigned';
      const current = groups.get(name) || {
        name,
        count: 0,
        balance: 0,
        limit: 0,
        tiers: { Low: 0, Medium: 0, High: 0 },
      };
      current.count += 1;
      current.balance += customer.outstandingBalance;
      current.limit += customer.creditLimit;
      const tier = tierById[customer.id];
      if (tier) current.tiers[tier] += 1;
      groups.set(name, current);
    });
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [filteredCustomers, tierById]);

  const sortedCustomers = useMemo(
    () =>
      [...filteredCustomers].sort((a, b) => {
        const riskRank = (tier: RiskTier | undefined) =>
          tier === 'High' ? 0 : tier === 'Medium' ? 1 : 2;
        return (
          riskRank(tierById[a.id]) - riskRank(tierById[b.id]) ||
          b.outstandingBalance - a.outstandingBalance
        );
      }),
    [filteredCustomers, tierById],
  );

  const resetFilters = () => {
    setSearchQuery('');
    setSegmentFilter('All');
    setTierFilter('All');
    setCardFilter('All');
    setUtilizationFilter('All');
  };

  const handleQuickSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchIdInput.trim().toUpperCase();
    if (!query) {
      setSearchError('Enter a customer ID to search the portfolio.');
      return;
    }
    const customer = await api.getCustomerById(query);
    if (customer) {
      setSearchError('');
      onSelectCustomer(customer.id);
      onNavigate('assessment');
    } else {
      setSearchError(`Customer ID "${query}" was not found.`);
    }
  };

  if (loading && customers.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 animate-pulse">
        <div className="h-32 border-l-4 border-[#4338ca] bg-gray-100" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 bg-gray-100" />
          ))}
        </div>
        <div className="h-96 bg-gray-100" />
      </div>
    );
  }

  if (loadError && customers.length === 0) {
    return (
      <div role="alert" className="mx-auto max-w-[1400px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">Portfolio data could not be loaded.</p>
        <p className="mt-1">{loadError}</p>
        <button onClick={() => void loadDashboardData()} className="mt-4 font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  const isDemo = source !== 'live-ml-backend' && source !== 'live-python-backend';
  const visibleAccounts = sortedCustomers.slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 pb-16">
      <header className="flex flex-col justify-between gap-6 border-b border-[#e5e7eb] pb-6 lg:flex-row lg:items-end">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Portfolio Overview &amp; Summary</div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl lg:text-5xl">
            Segment performance
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-gray-500">
            Explore portfolio exposure and risk across customer segments. Metrics respond to the selected filters.
          </p>
          <span
            className={`mt-3 inline-flex border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              isDemo
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {isDemo ? 'Demo proxy data' : 'Live portfolio data'}
          </span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <form onSubmit={handleQuickSearch} className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2 border-b-2 border-[#1a1a1a] px-1 py-2">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  aria-label="Find customer by ID"
                  value={searchIdInput}
                  onChange={(event) => {
                    setSearchIdInput(event.target.value);
                    setSearchError('');
                  }}
                  placeholder="Find customer ID"
                  className="w-full min-w-36 bg-transparent text-xs text-[#1a1a1a] outline-none placeholder:text-gray-400 sm:w-48"
                />
                <button type="submit" className="meta text-[#4338ca] hover:text-[#1a1a1a]">
                  FIND
                </button>
              </div>
              {searchError && <span className="mt-1 text-xs text-rose-700">{searchError}</span>}
            </form>
            <button
              onClick={() => void loadDashboardData()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 border border-[#e5e7eb] bg-white px-4 py-2.5 text-xs font-semibold text-[#4338ca] transition hover:border-[#4338ca] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
        </div>
      </header>

      {isDemo && (
        <p className="-mt-6 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Demo proxy data is shown separately when the live portfolio is unavailable. Demo records are not presented as live customer data.
        </p>
      )}

      <section aria-label="Portfolio filters" className="border border-[#e5e7eb] bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
            <Filter className="h-4 w-4 text-[#4338ca]" />
            Filter portfolio
          </div>
          <button
            onClick={resetFilters}
            className="meta inline-flex items-center gap-1 hover:text-[#4338ca]"
          >
            <X className="h-3.5 w-3.5" />
            Reset filters
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
            Segment
            <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)} className={selectClassName}>
              <option value="All">All segments</option>
              {segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
            Risk tier
            <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value as TierFilter)} className={selectClassName}>
              <option value="All">All risk tiers</option>
              {TIER_ORDER.map((tier) => <option key={tier} value={tier}>{tier} risk</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
            Card type
            <select value={cardFilter} onChange={(event) => setCardFilter(event.target.value)} className={selectClassName}>
              <option value="All">All card types</option>
              {cardTypes.map((cardType) => <option key={cardType} value={cardType}>{cardType}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
            Card utilization
            <select value={utilizationFilter} onChange={(event) => setUtilizationFilter(event.target.value as UtilizationFilter)} className={selectClassName}>
              <option value="All">Any utilization</option>
              <option value="0-30">0–30%</option>
              <option value="31-60">31–60%</option>
              <option value="61-80">61–80%</option>
              <option value="80+">Over 80%</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
            Search records
            <span className="flex items-center gap-2 border border-[#e5e7eb] bg-white px-3 py-2.5 focus-within:border-[#4338ca]">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Name or customer ID"
                className="w-full min-w-0 bg-transparent text-xs text-[#1a1a1a] outline-none placeholder:text-gray-400"
              />
            </span>
          </label>
        </div>
      </section>

      <section aria-label="Filtered portfolio metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'Accounts in view',
            value: totals.accountCount.toLocaleString(),
            detail: `of ${customers.length.toLocaleString()} loaded accounts`,
            icon: Users,
            color: 'bg-indigo-50 text-[#4338ca]',
          },
          {
            title: 'Outstanding balance',
            value: currency(totals.balance),
            detail: `Credit limit ${currency(totals.creditLimit)}`,
            icon: CircleDollarSign,
            color: 'bg-sky-50 text-sky-700',
          },
          {
            title: 'Average utilization',
            value: `${totals.utilization.toFixed(1)}%`,
            detail: 'Balance divided by total credit limit',
            icon: CreditCard,
            color: 'bg-amber-50 text-amber-700',
          },
          {
            title: 'High-risk share',
            value: `${totals.highRiskShare.toFixed(1)}%`,
            detail: `${filteredCustomers.filter((customer) => tierById[customer.id] === 'High').length} high-risk accounts`,
            icon: ShieldCheck,
            color: 'bg-rose-50 text-[#be123c]',
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.title} className="border-b border-[#e5e7eb] px-2 py-3 lg:border-b-0 lg:border-r lg:last:border-r-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="meta">{metric.title}</p>
                  <p className="py-1 text-3xl font-serif font-semibold tracking-tight text-[#1a1a1a]">{metric.value}</p>
                </div>
                <span className={`p-2 ${metric.color}`}><Icon className="h-4 w-4" /></span>
              </div>
              <p className="text-xs text-gray-500">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-5">
        <article className="border border-[#e5e7eb] bg-white p-5 sm:p-6 xl:col-span-3">
          <div className="mb-6 flex items-start justify-between gap-3 border-b border-[#e5e7eb] pb-3">
            <div>
              <p className="meta text-[#4338ca]">Segment breakdown</p>
              <h2 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">Accounts by customer segment</h2>
              <p className="mt-1 text-xs text-gray-500">Risk mix and account share in the filtered portfolio</p>
            </div>
            <BarChart3 className="h-5 w-5 shrink-0 text-[#4338ca]" />
          </div>
          {segmentStats.length ? (
            <div className="space-y-5">
              {segmentStats.map((segment) => {
                const share = totals.accountCount ? (segment.count / totals.accountCount) * 100 : 0;
                return (
                  <button
                    key={segment.name}
                    onClick={() => setSegmentFilter(segment.name)}
                    className="block w-full p-2 text-left transition hover:bg-[#fdfcf9] focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    aria-label={`Filter dashboard to ${segment.name}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-[#1a1a1a]">{segment.name}</span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {segment.count} · {share.toFixed(1)}% · {currency(segment.balance)}
                      </span>
                    </div>
                    <div className="flex h-3 overflow-hidden border border-[#e5e7eb] bg-gray-100">
                      {TIER_ORDER.map((tier) => {
                        const width = segment.count ? (segment.tiers[tier] / segment.count) * 100 : 0;
                        return width ? (
                          <span
                            key={tier}
                            title={`${tier}: ${segment.tiers[tier]} accounts`}
                            style={{ width: `${width}%`, backgroundColor: TIER_COLORS[tier] }}
                          />
                        ) : null;
                      })}
                    </div>
                  </button>
                );
              })}
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#e5e7eb] pt-4">
                {TIER_ORDER.map((tier) => (
                  <span key={tier} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="h-2.5 w-2.5" style={{ backgroundColor: TIER_COLORS[tier] }} />
                    {tier} risk
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#fdfcf9] px-4 py-10 text-center text-sm text-gray-500">
              No accounts match these filters.
            </div>
          )}
        </article>

        <article className="border border-[#e5e7eb] bg-white p-5 sm:p-6 xl:col-span-2">
          <p className="meta text-[#4338ca]">Exposure ranking</p>
          <h2 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">Balance by segment</h2>
          <p className="mt-1 text-xs text-gray-500">Outstanding balances summed from matching customer records</p>
          <div className="mt-6 space-y-5">
            {segmentStats.length ? segmentStats.map((segment) => {
              const maxBalance = Math.max(...segmentStats.map((item) => item.balance), 1);
              return (
                <button
                  key={segment.name}
                  onClick={() => setSegmentFilter(segment.name)}
                  className="block w-full text-left"
                  aria-label={`Filter dashboard to ${segment.name}`}
                >
                  <div className="mb-1.5 flex justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-[#1a1a1a]">{segment.name}</span>
                    <span className="shrink-0 font-semibold text-[#1a1a1a]">{currency(segment.balance)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden border border-[#e5e7eb] bg-gray-100">
                    <div
                      className="h-full bg-[#4338ca]"
                      style={{ width: `${(segment.balance / maxBalance) * 100}%` }}
                    />
                  </div>
                </button>
              );
            }) : (
              <div className="bg-[#fdfcf9] px-4 py-10 text-center text-sm text-gray-500">
                No segment exposure to display.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="border border-[#e5e7eb] bg-white p-5 sm:p-6">
        <div className="mb-5 border-b border-[#e5e7eb] pb-3">
          <p className="meta text-[#4338ca]">Segment comparison</p>
          <h2 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">Balance and credit limit by segment</h2>
          <p className="mt-1 text-xs text-gray-500">
            Account-level totals from the current filtered view; lines compare segments, not changes over time.
          </p>
        </div>
        {segmentStats.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-5 text-xs text-gray-600">
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[#4338ca]" />Outstanding balance</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[#b45309]" />Credit limit</span>
            </div>
            <div className="overflow-x-auto">
              <svg
                role="img"
                aria-label="Line chart comparing total outstanding balance and credit limit for each filtered customer segment"
                viewBox="0 0 720 280"
                className="h-64 min-w-[560px] w-full"
              >
                {Array.from({ length: 5 }, (_, index) => {
                  const y = 24 + index * 48;
                  const maximum = Math.max(...segmentStats.map((segment) => segment.limit), 1);
                  return (
                    <g key={index}>
                      <line x1="76" y1={y} x2="700" y2={y} stroke="#e5e7eb" strokeDasharray="4 5" />
                      <text x="66" y={y + 4} textAnchor="end" fill="#6b7280" fontSize="10">
                        {currency(maximum * (4 - index) / 4)}
                      </text>
                    </g>
                  );
                })}
                {(() => {
                  const maxValue = Math.max(...segmentStats.map((segment) => segment.limit), 1);
                  const xAt = (index: number) =>
                    segmentStats.length === 1 ? 388 : 84 + (index * 600) / (segmentStats.length - 1);
                  const yAt = (amount: number) => 216 - (amount / maxValue) * 192;
                  const balancePoints = segmentStats
                    .map((segment, index) => `${xAt(index)},${yAt(segment.balance)}`)
                    .join(' ');
                  const limitPoints = segmentStats
                    .map((segment, index) => `${xAt(index)},${yAt(segment.limit)}`)
                    .join(' ');
                  return (
                    <g>
                      <polyline points={limitPoints} fill="none" stroke="#b45309" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                      <polyline points={balancePoints} fill="none" stroke="#4338ca" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                      {segmentStats.map((segment, index) => (
                        <g key={segment.name}>
                          <circle cx={xAt(index)} cy={yAt(segment.limit)} r="4" fill="#b45309" stroke="white" strokeWidth="2">
                            <title>{`${segment.name}: ${currency(segment.limit)} credit limit`}</title>
                          </circle>
                          <circle cx={xAt(index)} cy={yAt(segment.balance)} r="4" fill="#4338ca" stroke="white" strokeWidth="2">
                            <title>{`${segment.name}: ${currency(segment.balance)} outstanding balance`}</title>
                          </circle>
                          <text x={xAt(index)} y="240" textAnchor="middle" fill="#1a1a1a" fontSize="10">
                            {segment.name.length > 18 ? `${segment.name.slice(0, 16)}…` : segment.name}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>
            </div>
          </>
        ) : (
          <div className="bg-[#fdfcf9] px-4 py-10 text-center text-sm text-gray-500">
            No segment data matches these filters.
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="overflow-hidden border border-[#e5e7eb] bg-white xl:col-span-2">
          <div className="flex flex-col justify-between gap-3 border-b border-[#e5e7eb] p-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-xl font-serif font-semibold text-[#1a1a1a]">Accounts in this view</h2>
              <p className="mt-1 text-xs text-gray-500">
                Showing {Math.min(visibleAccounts.length, totals.accountCount)} of {totals.accountCount} matching accounts
              </p>
            </div>
            <button onClick={() => onNavigate('search')} className="meta inline-flex items-center gap-1 text-[#4338ca] hover:text-[#1a1a1a]">
              Browse customers <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {visibleAccounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#fdfcf9] text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold sm:px-6">Customer</th>
                    <th className="px-3 py-3 font-semibold">Segment</th>
                    <th className="px-3 py-3 font-semibold">Risk</th>
                    <th className="px-3 py-3 text-right font-semibold">Balance</th>
                    <th className="px-5 py-3 text-right font-semibold sm:px-6">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e7eb]">
                  {visibleAccounts.map((customer) => {
                    const tier = tierById[customer.id];
                    return (
                      <tr key={customer.id} className="transition hover:bg-[#fdfcf9]">
                        <td className="px-5 py-3 sm:px-6">
                          <button
                            onClick={() => {
                              onSelectCustomer(customer.id);
                              onNavigate('assessment');
                            }}
                            className="text-left"
                          >
                            <span className="block font-semibold text-[#1a1a1a]">{customer.fullName}</span>
                            <span className="mono text-xs text-gray-400">{customer.id}</span>
                          </button>
                        </td>
                        <td className="max-w-48 truncate px-3 py-3 text-gray-600">{customer.segment || 'Unassigned'}</td>
                        <td className="px-3 py-3">
                          {tier ? (
                            <span className="border px-2.5 py-1 text-xs font-semibold" style={{ color: TIER_COLORS[tier], backgroundColor: `${TIER_COLORS[tier]}18`, borderColor: `${TIER_COLORS[tier]}50` }}>
                              {tier}
                            </span>
                          ) : <span className="text-xs text-gray-400">Not classified</span>}
                        </td>
                        <td className="mono px-3 py-3 text-right tabular-nums text-[#1a1a1a]">{currency(customer.outstandingBalance)}</td>
                        <td className="mono px-5 py-3 text-right tabular-nums text-[#1a1a1a] sm:px-6">{customer.creditUtilization.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-medium text-[#1a1a1a]">No customers match the current filters.</p>
              <button onClick={resetFilters} className="meta mt-2 text-[#4338ca] hover:underline">Clear filters</button>
            </div>
          )}
        </article>

        <article className="border border-[#e5e7eb] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="meta text-[#be123c]">Surveillance</p>
              <h2 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">Active alerts</h2>
            </div>
            <Activity className="h-5 w-5 text-[#be123c]" />
          </div>
          {activeAlerts.length ? (
            <div className="mt-5 space-y-3">
              {activeAlerts.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => {
                    onSelectCustomer(alert.customerId);
                    onNavigate('assessment');
                  }}
                  className="w-full border border-[#e5e7eb] bg-[#fdfcf9] p-3 text-left transition hover:border-rose-200 hover:bg-rose-50/50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="mono text-xs font-semibold text-gray-500">{alert.customerId}</span>
                    <span className="border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{alert.severity}</span>
                  </span>
                  <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#1a1a1a]">{alert.triggerReason}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
              No unresolved alerts are available.
            </div>
          )}
          <button onClick={() => onNavigate('alerts')} className="meta mt-4 inline-flex items-center gap-1 text-[#4338ca] hover:text-[#1a1a1a]">
            View alerts <ArrowRight className="h-4 w-4" />
          </button>
        </article>
      </section>

      <footer className="flex flex-col justify-between gap-2 border-t border-[#e5e7eb] pt-4 text-xs text-gray-500 sm:flex-row">
        <span>{isDemo ? 'Demo proxy records' : 'Live portfolio records'} · Metrics are calculated from the records currently matching your filters.</span>
        <span>{totals.accountCount.toLocaleString()} accounts in current view</span>
      </footer>
    </div>
  );
};
