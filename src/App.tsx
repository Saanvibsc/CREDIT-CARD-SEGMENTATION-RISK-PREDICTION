/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Customer, RiskConfig } from './types';
import { DEFAULT_RISK_CONFIG } from './utils/scoringEngine';
import { api } from './services/api';
import { TopNav } from './components/TopNav';
import { NavPage } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CustomerWiseDashboard } from './components/CustomerWiseDashboard';
import { SegmentWiseDashboard } from './components/SegmentWiseDashboard';
import { CustomerSearch } from './components/CustomerSearch';
import { RiskAssessment } from './components/RiskAssessment';
import { EarlyWarningAlerts } from './components/EarlyWarningAlerts';
import { CustomerSegmentation } from './components/CustomerSegmentation';
import { RiskReports } from './components/RiskReports';
import { UploadReport } from './components/UploadReport';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('customer-dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('CUST000001');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(6);
  const [apiRefreshKey, setApiRefreshKey] = useState<number>(0);
  const [apiError, setApiError] = useState('');

  // Load customer index for customer switcher and report menus
  useEffect(() => {
    api.searchCustomers(undefined, undefined, undefined, config)
      .then((data: Customer[]) => {
        setApiError('');
        setCustomers(data);
        if (data.length > 0 && !data.some((c: Customer) => c.id === selectedCustomerId)) {
          setSelectedCustomerId(data[0].id);
        }
      })
      .catch((err: unknown) => {
        console.error('Error fetching customers in App root:', err);
        setApiError(err instanceof Error ? err.message : 'Backend request failed.');
      });

    api.getAlerts().then((alerts: any[]) => {
      setActiveAlertCount(alerts.filter((a: any) => a.status !== 'Resolved').length);
    }).catch((err: unknown) => {
      console.error('Error fetching alerts in App root:', err);
      setApiError(err instanceof Error ? err.message : 'Backend request failed.');
    });
  }, [config, apiRefreshKey]);

  // Active customer object
  const activeCustomer =
    customers.find((c: Customer) => c.id === selectedCustomerId) ||
    customers[0] ||
    null;

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-[#1a1a1a] flex flex-col font-sans">
      {/* Variation 3 Editorial Top Navigation */}
      <TopNav
        currentPage={currentPage}
        onNavigate={(page: NavPage) => setCurrentPage(page)}
        onSelectCustomer={(id: string) => setSelectedCustomerId(id)}
        activeAlertCount={activeAlertCount}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 px-4 sm:px-8 lg:px-16 pt-8 pb-16 overflow-y-auto">
        {apiError && (
          <div role="alert" className="max-w-[1400px] mx-auto mb-6 border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
            Backend request failed: {apiError}. Check connection settings or use the local demo proxy.
          </div>
        )}
        {currentPage === 'customer-dashboard' && (
          <CustomerWiseDashboard
            selectedCustomerId={selectedCustomerId}
            config={config}
            onNavigate={(page) => setCurrentPage(page)}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}

        {currentPage === 'segment-dashboard' && (
          <SegmentWiseDashboard
            config={config}
            onNavigate={(page) => setCurrentPage(page)}
            onSelectCustomer={(id) => {
              setSelectedCustomerId(id);
              setCurrentPage('customer-dashboard');
            }}
          />
        )}

        {currentPage === 'dashboard' && (
          <Dashboard
            config={config}
            selectedCustomerId={selectedCustomerId}
            onNavigate={(page) => setCurrentPage(page)}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}

        {currentPage === 'search' && (
          <CustomerSearch
            config={config}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onNavigate={(page) => setCurrentPage(page)}
          />
        )}

        {currentPage === 'assessment' && (
          <RiskAssessment
            customer={activeCustomer}
            allCustomers={customers}
            config={config}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onNavigate={(page) => setCurrentPage(page)}
          />
        )}

        {currentPage === 'alerts' && (
          <EarlyWarningAlerts
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onNavigate={(page) => setCurrentPage(page)}
            onAlertsCountChange={(count) => setActiveAlertCount(count)}
          />
        )}

        {currentPage === 'segmentation' && (
          <SegmentWiseDashboard
            config={config}
            onNavigate={(page) => setCurrentPage(page)}
            onSelectCustomer={(id) => {
              setSelectedCustomerId(id);
              setCurrentPage('customer-dashboard');
            }}
          />
        )}

        {currentPage === 'reports' && (
          <RiskReports
            selectedCustomerId={selectedCustomerId}
            customers={customers}
            config={config}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onNavigate={(page) => setCurrentPage(page)}
          />
        )}

        {currentPage === 'upload-report' && <UploadReport config={config} />}
      </main>
    </div>
  );
}
