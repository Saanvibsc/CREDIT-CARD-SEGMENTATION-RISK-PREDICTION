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
import { CustomerSearch } from './components/CustomerSearch';
import { RiskAssessment } from './components/RiskAssessment';
import { EarlyWarningAlerts } from './components/EarlyWarningAlerts';
import { CustomerSegmentation } from './components/CustomerSegmentation';
import { RiskReports } from './components/RiskReports';
import { Settings } from './components/Settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('CG-8041');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(6);
  const [apiRefreshKey, setApiRefreshKey] = useState<number>(0);

  // Load customer index for customer switcher and report menus
  useEffect(() => {
    api.searchCustomers(undefined, undefined, undefined, config)
      .then((data) => {
        setCustomers(data);
        if (data.length > 0 && !data.some(c => c.id === selectedCustomerId)) {
          setSelectedCustomerId(data[0].id);
        }
      })
      .catch((err) => {
        console.error('Error fetching customers in App root:', err);
      });

    api.getAlerts().then((alerts) => {
      setActiveAlertCount(alerts.filter(a => a.status !== 'Resolved').length);
    });
  }, [config, apiRefreshKey]);

  // Active customer object
  const activeCustomer =
    customers.find((c) => c.id === selectedCustomerId) ||
    customers[0] ||
    ({
      id: 'CG-8041',
      fullName: 'Eleanor Vance',
      email: 'e.vance@acme-corp.com',
      age: 41,
      employmentStatus: 'Full-time Senior Director',
      employerCategory: 'Healthcare Services',
      annualIncome: 145000,
      cardType: 'Platinum Reserve',
      creditLimit: 35000,
      outstandingBalance: 3200,
      creditUtilization: 9.1,
      repaymentHistory: [],
      delayedPayments6M: 0,
      paymentToMinRatio: 29.1,
      cashAdvanceCount6M: 0,
      monthlyAverageSpend: 3316,
      creditHistoryYears: 14,
      inquiriesLast6M: 0,
      segment: 'Prime Transactors',
      joinedDate: '2012-04-18',
      lastAssessmentDate: '2026-10-09',
    } as Customer);

  const handleBackendModeChange = () => {
    setApiRefreshKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-[#1a1a1a] flex flex-col font-sans">
      {/* Variation 3 Editorial Top Navigation */}
      <TopNav
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page)}
        onSelectCustomer={(id) => setSelectedCustomerId(id)}
        activeAlertCount={activeAlertCount}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 px-4 sm:px-8 lg:px-16 pt-8 pb-16 overflow-y-auto">
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

        {currentPage === 'settings' && (
          <Settings
            config={config}
            onUpdateConfig={(newConfig) => setConfig(newConfig)}
            onBackendModeChange={handleBackendModeChange}
          />
        )}
      </main>
    </div>
  );
}
