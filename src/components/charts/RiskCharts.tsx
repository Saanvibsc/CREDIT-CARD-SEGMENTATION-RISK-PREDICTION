import React, { useState } from 'react';
import { RiskTier } from '../../types';

interface RiskDistributionChartProps {
  lowCount: number;
  mediumCount: number;
  highCount: number;
  total: number;
}

export const RiskDistributionChart: React.FC<RiskDistributionChartProps> = ({
  lowCount,
  mediumCount,
  highCount,
  total,
}) => {
  const [hoveredTier, setHoveredTier] = useState<RiskTier | null>(null);

  const lowPct = total > 0 ? (lowCount / total) * 100 : 0;
  const medPct = total > 0 ? (mediumCount / total) * 100 : 0;
  const highPct = total > 0 ? (highCount / total) * 100 : 0;

  // Donut chart geometry
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  const lowStroke = (lowPct / 100) * circumference;
  const medStroke = (medPct / 100) * circumference;
  const highStroke = (highPct / 100) * circumference;

  const lowOffset = 0;
  const medOffset = -lowStroke;
  const highOffset = -(lowStroke + medStroke);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
      {/* SVG Donut */}
      <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="#e5e7eb"
            strokeWidth="12"
          />
          {/* Low Risk: Indigo (#4338ca) */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="#4338ca"
            strokeWidth={hoveredTier === 'Low' ? '16' : '12'}
            strokeDasharray={`${lowStroke} ${circumference}`}
            strokeDashoffset={lowOffset}
            className="transition-all duration-200 cursor-pointer"
            onMouseEnter={() => setHoveredTier('Low')}
            onMouseLeave={() => setHoveredTier(null)}
          />
          {/* Medium Risk: Amber (#b45309) */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="#b45309"
            strokeWidth={hoveredTier === 'Medium' ? '16' : '12'}
            strokeDasharray={`${medStroke} ${circumference}`}
            strokeDashoffset={medOffset}
            className="transition-all duration-200 cursor-pointer"
            onMouseEnter={() => setHoveredTier('Medium')}
            onMouseLeave={() => setHoveredTier(null)}
          />
          {/* High Risk: Crimson (#be123c) */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="#be123c"
            strokeWidth={hoveredTier === 'High' ? '16' : '12'}
            strokeDasharray={`${highStroke} ${circumference}`}
            strokeDashoffset={highOffset}
            className="transition-all duration-200 cursor-pointer"
            onMouseEnter={() => setHoveredTier('High')}
            onMouseLeave={() => setHoveredTier(null)}
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="meta text-[9px]">
            {hoveredTier ? `${hoveredTier} Risk` : 'Total Index'}
          </span>
          <span className="text-2xl font-serif font-bold text-[#1a1a1a]">
            {hoveredTier === 'Low'
              ? `${lowCount}`
              : hoveredTier === 'Medium'
              ? `${mediumCount}`
              : hoveredTier === 'High'
              ? `${highCount}`
              : `${total}`}
          </span>
          <span className="mono text-[10px] text-gray-500">
            {hoveredTier === 'Low'
              ? `${lowPct.toFixed(1)}%`
              : hoveredTier === 'Medium'
              ? `${medPct.toFixed(1)}%`
              : hoveredTier === 'High'
              ? `${highPct.toFixed(1)}%`
              : 'Cards'}
          </span>
        </div>
      </div>

      {/* Legend list */}
      <div className="w-full space-y-2 text-xs">
        <div 
          onMouseEnter={() => setHoveredTier('Low')}
          onMouseLeave={() => setHoveredTier(null)}
          className={`p-2.5 border transition-all cursor-pointer ${
            hoveredTier === 'Low' ? 'border-[#4338ca] bg-[#eff6ff]' : 'border-[#e5e7eb] bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4338ca]" />
              <span className="font-semibold text-[#1a1a1a]">Class A — Low Risk (&lt; 35)</span>
            </div>
            <div className="mono font-bold text-[#4338ca]">
              {lowCount} ({lowPct.toFixed(1)}%)
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Prime cardholders; negligible charge-off likelihood.</p>
        </div>

        <div 
          onMouseEnter={() => setHoveredTier('Medium')}
          onMouseLeave={() => setHoveredTier(null)}
          className={`p-2.5 border transition-all cursor-pointer ${
            hoveredTier === 'Medium' ? 'border-[#b45309] bg-amber-50/70' : 'border-[#e5e7eb] bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#b45309]" />
              <span className="font-semibold text-[#1a1a1a]">Class B — Medium Risk (35–64)</span>
            </div>
            <div className="mono font-bold text-[#b45309]">
              {mediumCount} ({medPct.toFixed(1)}%)
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Revolving balance exposure; watchlist monitoring.</p>
        </div>

        <div 
          onMouseEnter={() => setHoveredTier('High')}
          onMouseLeave={() => setHoveredTier(null)}
          className={`p-2.5 border transition-all cursor-pointer ${
            hoveredTier === 'High' ? 'border-[#be123c] bg-rose-50/70' : 'border-[#e5e7eb] bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#be123c]" />
              <span className="font-semibold text-[#1a1a1a]">Class C — High Risk (&ge; 65)</span>
            </div>
            <div className="mono font-bold text-[#be123c]">
              {highCount} ({highPct.toFixed(1)}%)
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Severe utilization strain; mandatory workout required.</p>
        </div>
      </div>
    </div>
  );
};

interface PortfolioExposureChartProps {
  lowExposure: number;
  lowLimit: number;
  medExposure: number;
  medLimit: number;
  highExposure: number;
  highLimit: number;
}

export const PortfolioExposureChart: React.FC<PortfolioExposureChartProps> = ({
  lowExposure,
  lowLimit,
  medExposure,
  medLimit,
  highExposure,
  highLimit,
}) => {
  const tiers = [
    {
      tier: 'Class A (Low Risk)',
      color: 'bg-[#4338ca]',
      barColor: '#4338ca',
      exposure: lowExposure,
      limit: lowLimit,
      utilization: lowLimit > 0 ? (lowExposure / lowLimit) * 100 : 0,
    },
    {
      tier: 'Class B (Medium Risk)',
      color: 'bg-[#b45309]',
      barColor: '#b45309',
      exposure: medExposure,
      limit: medLimit,
      utilization: medLimit > 0 ? (medExposure / medLimit) * 100 : 0,
    },
    {
      tier: 'Class C (High Risk)',
      color: 'bg-[#be123c]',
      barColor: '#be123c',
      exposure: highExposure,
      limit: highLimit,
      utilization: highLimit > 0 ? (highExposure / highLimit) * 100 : 0,
    },
  ];

  const maxLimit = Math.max(...tiers.map((t) => t.limit), 100000);

  return (
    <div className="space-y-4 text-xs">
      {tiers.map((item) => {
        const exposureWidth = (item.exposure / maxLimit) * 100;
        const totalLimitWidth = (item.limit / maxLimit) * 100;

        return (
          <div key={item.tier} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-[#1a1a1a]">
                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                <span>{item.tier}</span>
              </div>
              <div className="mono text-gray-600">
                <span className="font-bold text-[#1a1a1a]">${(item.exposure / 1000).toFixed(1)}k</span>
                <span className="text-gray-400"> / ${(item.limit / 1000).toFixed(1)}k limit</span>
                <span className="ml-2 font-medium text-[#4338ca]">({item.utilization.toFixed(1)}% util)</span>
              </div>
            </div>

            {/* Comparison bar */}
            <div className="h-3.5 bg-gray-100 overflow-hidden relative border border-[#e5e7eb]">
              <div
                className="h-full bg-gray-200 absolute left-0 top-0"
                style={{ width: `${totalLimitWidth}%` }}
              />
              <div
                className="h-full absolute left-0 top-0 transition-all duration-300"
                style={{
                  width: `${exposureWidth}%`,
                  backgroundColor: item.barColor,
                }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-3 border-t border-[#e5e7eb]">
        <div className="flex items-center gap-4 mono text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-gray-300" />
            <span>Credit Limit Capacity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#1a1a1a]" />
            <span>Drawn Balance Exposure</span>
          </div>
        </div>
        <span className="meta">Monitoring Cycle 2026.10</span>
      </div>
    </div>
  );
};

interface RiskScoreGaugeProps {
  score: number; // 0 to 100
  tier: RiskTier;
  size?: number;
}

export const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({ score, tier, size = 190 }) => {
  const strokeWidth = 12;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;
  const arcLength = Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score)) / 100;
  const progressOffset = arcLength * (1 - progress);

  let statusColor = '#4338ca';
  if (tier === 'Medium') statusColor = '#b45309';
  if (tier === 'High') statusColor = '#be123c';

  return (
    <div className="flex flex-col items-center justify-center relative">
      <svg
        width={size}
        height={size * 0.62}
        viewBox={`0 0 ${size} ${size * 0.65}`}
        className="overflow-visible"
      >
        {/* Background track */}
        <path
          d={`M ${strokeWidth} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${center}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Active progress */}
        <path
          d={`M ${strokeWidth} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${center}`}
          fill="none"
          stroke={statusColor}
          strokeWidth={strokeWidth + 2}
          strokeDasharray={arcLength}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>

      {/* Center readout */}
      <div className="flex flex-col items-center -mt-8 sm:-mt-10 text-center">
        <span className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-[#1a1a1a]">
          {score}
        </span>
        <span className="meta mt-1">Risk Score / 100</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: statusColor }}
          />
          <span className="mono text-xs font-bold text-[#1a1a1a]">
            {tier} Risk
          </span>
        </div>
      </div>

      <div className="w-full flex justify-between px-2 mono text-[10px] text-gray-400 mt-2">
        <span>0 (Low)</span>
        <span>35</span>
        <span>65</span>
        <span>100 (High)</span>
      </div>
    </div>
  );
};
