import React, { useState } from 'react';
import { 
  Check, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp, 
  Activity, 
  AlertCircle
} from 'lucide-react';
import { RiskConfig } from '../types';
import { DEFAULT_RISK_CONFIG } from '../utils/scoringEngine';
import { api, API_ENDPOINTS_DOCUMENTATION } from '../services/api';

interface SettingsProps {
  config: RiskConfig;
  onUpdateConfig: (newConfig: RiskConfig) => void;
  onBackendModeChange?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  config, 
  onUpdateConfig,
  onBackendModeChange,
}) => {
  const [lowBound, setLowBound] = useState(config.lowRiskUpperBound);
  const [highBound, setHighBound] = useState(config.highRiskLowerBound);
  const [utilThreshold, setUtilThreshold] = useState(config.utilizationAlertThreshold);
  const [lateThreshold, setLateThreshold] = useState(config.consecutiveLateAlertThreshold);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const currentApiConfig = api.getConfig();
  const [backendMode, setBackendMode] = useState<'mock' | 'live'>(currentApiConfig.mode);
  const [baseUrl, setBaseUrl] = useState(currentApiConfig.baseUrl);
  const [pingStatus, setPingStatus] = useState<{
    tested: boolean;
    connected: boolean;
    latencyMs?: number;
    message: string;
    loading: boolean;
  }>({
    tested: false,
    connected: currentApiConfig.connectionStatus === 'connected',
    message: '',
    loading: false,
  });

  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>('/api/v1/risk/predict');

  const handleSaveThresholds = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      lowRiskUpperBound: lowBound,
      highRiskLowerBound: highBound,
      utilizationAlertThreshold: utilThreshold,
      consecutiveLateAlertThreshold: lateThreshold,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetThresholds = () => {
    setLowBound(DEFAULT_RISK_CONFIG.lowRiskUpperBound);
    setHighBound(DEFAULT_RISK_CONFIG.highRiskLowerBound);
    setUtilThreshold(DEFAULT_RISK_CONFIG.utilizationAlertThreshold);
    setLateThreshold(DEFAULT_RISK_CONFIG.consecutiveLateAlertThreshold);
    onUpdateConfig(DEFAULT_RISK_CONFIG);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleApplyBackendConfig = (newMode: 'mock' | 'live', newUrl: string) => {
    setBackendMode(newMode);
    api.setConfig({
      mode: newMode,
      baseUrl: newUrl,
      connectionStatus: newMode === 'live' ? 'checking' : 'fallback',
    });
    if (onBackendModeChange) {
      onBackendModeChange();
    }
  };

  const handleTestConnection = async () => {
    setPingStatus({ tested: true, connected: false, loading: true, message: 'Pinging backend health endpoint...' });
    const res = await api.testBackendConnection(baseUrl);
    setPingStatus({
      tested: true,
      connected: res.connected,
      latencyMs: res.latencyMs,
      message: res.message,
      loading: false,
    });
    if (res.connected) {
      handleApplyBackendConfig('live', baseUrl);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Governance &amp; Infrastructure Parameters</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            System Settings
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/creditguard-frontend.zip"
            download="creditguard-frontend.zip"
            className="mono text-xs px-3 py-1.5 bg-[#4338ca] text-white hover:bg-[#3730a3] transition-colors flex items-center gap-1.5"
          >
            <span>Download Project ZIP</span>
          </a>
          <button
            onClick={handleResetThresholds}
            className="mono text-xs px-3 py-1.5 border border-[#e5e7eb] hover:border-[#1a1a1a] bg-white transition-colors"
          >
            Reset Defaults
          </button>
        </div>
      </header>

      {/* GitHub Manual Upload Card */}
      <div className="bg-white border-2 border-[#1a1a1a] p-6 space-y-3">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-2">
          <div>
            <span className="meta text-[#4338ca]">GitHub Upload Assistant</span>
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a]">
              How to upload this manually to GitHub (BRANCH2-Maitreyi)
            </h3>
          </div>
          <a
            href="/creditguard-frontend.zip"
            download="creditguard-frontend.zip"
            className="mono text-xs px-3 py-1.5 bg-[#1a1a1a] text-white hover:bg-[#4338ca] transition-colors"
          >
            Download ZIP (184 KB)
          </a>
        </div>
        <ol className="text-xs space-y-1.5 text-gray-700 list-decimal list-inside leading-relaxed font-sans">
          <li>Click <strong>Download Project ZIP</strong> above to download the complete code package.</li>
          <li>Unzip the downloaded file on your computer (it contains <code>src/</code>, <code>index.html</code>, <code>package.json</code>, etc.).</li>
          <li>Go to <a href="https://github.com/Saanvibsc/CREDIT-CARD-SEGMENTATION-RISK-PREDICTION/tree/BRANCH2-Maitreyi" target="_blank" rel="noreferrer" className="text-[#4338ca] font-semibold underline">github.com/Saanvibsc/CREDIT-CARD-SEGMENTATION-RISK-PREDICTION/tree/BRANCH2-Maitreyi</a>.</li>
          <li>Make sure the branch dropdown in the top-left says <strong>BRANCH2-Maitreyi</strong>.</li>
          <li>Click <strong>Add file</strong> &rarr; <strong>Upload files</strong> in the top-right corner.</li>
          <li>Drag and drop the unzipped files/folders into GitHub and click <strong>Commit changes</strong>!</li>
        </ol>
      </div>

      {saveSuccess && (
        <div className="p-3 border border-emerald-700 bg-emerald-50 text-emerald-900 mono text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Governance thresholds updated. Portfolio recalculated.</span>
        </div>
      )}

      {/* Backend Mode Switcher */}
      <div className="bg-white border border-[#e5e7eb] p-6 sm:p-8 space-y-6">
        <div className="border-b border-[#1a1a1a] pb-3 flex items-center justify-between">
          <div>
            <span className="meta text-[#4338ca]">Service Architecture</span>
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mt-0.5">
              Backend Connection &amp; Routing Mode
            </h3>
          </div>
          <span className="meta">
            CURRENT: {backendMode === 'live' ? 'LIVE ML API' : 'MOCK PROXY'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div
            onClick={() => handleApplyBackendConfig('mock', baseUrl)}
            className={`p-4 border cursor-pointer transition-all ${
              backendMode === 'mock'
                ? 'border-[#4338ca] bg-[#eff6ff]/50'
                : 'border-[#e5e7eb] hover:border-gray-400 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-[#1a1a1a]">Demo Heuristic Proxy</span>
              {backendMode === 'mock' && <span className="meta text-[#4338ca]">ACTIVE</span>}
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed mt-1">
              Client-side deterministic underwriting card and 25 fictional customer profiles. Zero server dependency.
            </p>
          </div>

          <div
            onClick={() => handleApplyBackendConfig('live', baseUrl)}
            className={`p-4 border cursor-pointer transition-all ${
              backendMode === 'live'
                ? 'border-emerald-700 bg-emerald-50/50'
                : 'border-[#e5e7eb] hover:border-gray-400 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-[#1a1a1a]">Live Python ML Backend</span>
              {backendMode === 'live' && <span className="meta text-emerald-700">ACTIVE</span>}
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed mt-1">
              Direct HTTP calls to your teammate's FastAPI server. Interfacing Scikit-Learn Logistic Regression &amp; K-Means.
            </p>
          </div>
        </div>

        {/* Server Endpoint URL input */}
        <div className="space-y-2 pt-2 border-t border-[#e5e7eb]">
          <span className="meta">API Base URL</span>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="flex-1 bg-[#fdfcf9] border border-[#e5e7eb] py-2 px-3 mono text-xs text-[#1a1a1a] outline-none"
            />
            <button
              onClick={handleTestConnection}
              disabled={pingStatus.loading}
              className="py-2 px-4 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors shrink-0 flex items-center gap-2"
            >
              <Activity className={`w-3.5 h-3.5 ${pingStatus.loading ? 'animate-spin' : ''}`} />
              <span>{pingStatus.loading ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>

          {pingStatus.tested && (
            <div className={`p-3 border mono text-xs mt-2 ${
              pingStatus.connected ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-[#b45309] bg-amber-50 text-amber-900'
            }`}>
              <div className="font-bold">{pingStatus.connected ? '✓ BACKEND REACHABLE' : '⚠ CONNECTION TIMED OUT'}</div>
              <div className="text-[11px] mt-0.5">{pingStatus.message}</div>
            </div>
          )}
        </div>
      </div>

      {/* Threshold Configuration Form */}
      <form onSubmit={handleSaveThresholds} className="bg-white border border-[#e5e7eb] p-6 sm:p-8 space-y-6">
        <div className="border-b border-[#1a1a1a] pb-3 flex items-center justify-between">
          <div>
            <span className="meta text-[#4338ca]">Calibration</span>
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mt-0.5">
              Risk Tier Cutoff Thresholds (0–100 Scale)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
          <div className="space-y-2 border-b border-[#e5e7eb] pb-4">
            <div className="flex justify-between mono">
              <span className="meta">Class A Upper Bound:</span>
              <span className="font-bold text-[#4338ca]">{lowBound} / 100</span>
            </div>
            <input
              type="range"
              min="20"
              max="45"
              value={lowBound}
              onChange={(e) => setLowBound(parseInt(e.target.value, 10))}
              className="w-full accent-[#4338ca] cursor-pointer"
            />
            <p className="text-[11px] text-gray-500">Scores &le; {lowBound} classified as Low Risk (Prime).</p>
          </div>

          <div className="space-y-2 border-b border-[#e5e7eb] pb-4">
            <div className="flex justify-between mono">
              <span className="meta">Class C Lower Bound:</span>
              <span className="font-bold text-[#be123c]">&ge; {highBound} / 100</span>
            </div>
            <input
              type="range"
              min="55"
              max="80"
              value={highBound}
              onChange={(e) => setHighBound(parseInt(e.target.value, 10))}
              className="w-full accent-[#be123c] cursor-pointer"
            />
            <p className="text-[11px] text-gray-500">Scores &ge; {highBound} classified as High Risk (Watchlist).</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between mono">
              <span className="meta">Utilisation Alert:</span>
              <span className="font-bold text-[#1a1a1a]">&gt; {utilThreshold}%</span>
            </div>
            <input
              type="range"
              min="60"
              max="95"
              step="5"
              value={utilThreshold}
              onChange={(e) => setUtilThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-[#1a1a1a] cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between mono">
              <span className="meta">Late Cycle Tolerance:</span>
              <span className="font-bold text-[#1a1a1a]">&ge; {lateThreshold} late</span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              value={lateThreshold}
              onChange={(e) => setLateThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-[#1a1a1a] cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="py-2.5 px-6 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors"
          >
            Apply Thresholds
          </button>
        </div>
      </form>

      {/* API Endpoints Contract Inspector */}
      <div className="bg-[#1a1a1a] text-white p-6 sm:p-8 space-y-4">
        <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
          <div>
            <div className="meta text-gray-400">Integration Documentation</div>
            <h3 className="text-xl font-serif font-semibold text-white mt-1">
              REST Endpoints Contract (for Backend Teammate)
            </h3>
          </div>
          <span className="meta text-gray-400">{API_ENDPOINTS_DOCUMENTATION.length} Contracts</span>
        </div>

        <div className="space-y-2">
          {API_ENDPOINTS_DOCUMENTATION.map((ep) => {
            const isExpanded = expandedEndpoint === ep.path;
            return (
              <div key={ep.path} className="border border-gray-800 bg-[#242424] text-xs">
                <button
                  type="button"
                  onClick={() => setExpandedEndpoint(isExpanded ? null : ep.path)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="mono text-[10px] px-2 py-0.5 border border-gray-600 bg-black text-[#bfdbfe]">
                      {ep.method}
                    </span>
                    <span className="mono font-bold text-white">{ep.path}</span>
                    <span className="text-gray-400 text-[11px] hidden sm:inline">— {ep.description}</span>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-gray-800 bg-black mono text-[11px] space-y-3">
                    <div className="text-gray-400">{ep.description}</div>

                    {ep.requestBodySchema && (
                      <div>
                        <div className="meta text-gray-500 mb-1">Request Payload JSON Schema:</div>
                        <pre className="p-2 border border-gray-800 text-purple-300 text-[10px] overflow-x-auto">
                          {ep.requestBodySchema}
                        </pre>
                      </div>
                    )}

                    <div>
                      <div className="meta text-gray-500 mb-1">Response JSON Schema:</div>
                      <pre className="p-2 border border-gray-800 text-teal-300 text-[10px] overflow-x-auto">
                        {ep.responseSchema}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
