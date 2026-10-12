/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Customer, RiskConfig } from './types';
import { INITIAL_CUSTOMERS } from './data/mockData';
import { DEFAULT_RISK_CONFIG } from './utils/scoringEngine';
import { api } from './services/api';
import { TopNav } from './components/TopNav';
import { NavPage } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CustomerSearch } from './components/CustomerSearch';
import { RiskAssessment } from './components/RiskAssessment';
import { EarlyWarningAlerts } from './components/EarlyWarningAlerts';
import { CustomerSegmentation } from './components/CustomerSegmentation';
import { RiskReports } from './components/RiskReports';
import { PythonEngine } from './components/PythonEngine';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(INITIAL_CUSTOMERS[0]?.id || 'CUST000001');
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
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
    INITIAL_CUSTOMERS[0];

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
        {currentPage === 'dashboard' && (
          <Dashboard
            config={config}
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
          <CustomerSegmentation
            config={config}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onNavigate={(page) => setCurrentPage(page)}
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

        {currentPage === 'python-engine' && (
          <PythonEngine
            onNavigate={(page) => setCurrentPage(page)}
            selectedCustomerId={selectedCustomerId}
          />
        )}
      </main>
    </div>
  );
}
