// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';

// Feature Views
import LoginView from './features/auth/LoginView';
import DashboardView from './features/dashboard/DashboardView';
import ClientsView from './features/clients/ClientsView';
import QuotationsView from './features/quotations/QuotationsView';
import ReadyToInvoiceView from './features/invoices/ReadyToInvoiceView';
import InvoicesView from './features/invoices/InvoicesView';
import PaymentsView from './features/payments/PaymentsView';
import LedgerView from './features/ledger/LedgerView';
import RecoverableCostsView from './features/costs/RecoverableCostsView';
import GovtFeesView from './features/govtFees/GovtFeesView';
import ReimbursementsView from './features/reimbursements/ReimbursementsView';
import MiscJobsView from './features/misc/MiscJobsView';
import PettyCashView from './features/pettyCash/PettyCashView';
import { DispatchList } from './features/dispatches/DispatchList';
import { AddressBookView } from './features/dispatches/AddressBookView';
import { TimelineEventsPanel } from './features/dispatches/TimelineEventsPanel';
import SettingsView from './features/settings/SettingsView';
import IntegrationsView from './features/admin/IntegrationsView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={<LoginView />} />

          {/* Authenticated Application Shell */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardView />} />
            <Route path="dashboard" element={<DashboardView />} />
            <Route path="clients" element={<ClientsView />} />
            <Route path="quotations" element={<QuotationsView />} />
            <Route path="ready-to-invoice" element={<ReadyToInvoiceView />} />
            <Route path="invoices/ready" element={<ReadyToInvoiceView />} />
            <Route path="invoices" element={<InvoicesView />} />
            <Route path="payments" element={<PaymentsView />} />
            <Route path="ledger" element={<LedgerView />} />
            <Route path="recoverable-costs" element={<RecoverableCostsView />} />
            <Route path="costs" element={<RecoverableCostsView />} />
            <Route path="govt-fees" element={<GovtFeesView />} />
            <Route path="reimbursements" element={<ReimbursementsView />} />
            <Route path="misc-jobs" element={<MiscJobsView />} />
            <Route path="petty-cash" element={<PettyCashView />} />
            <Route path="dispatches" element={<DispatchList />} />
            <Route path="address-book" element={<AddressBookView />} />
            <Route path="timeline" element={<TimelineEventsPanel />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="admin/integrations" element={<IntegrationsView />} />
          </Route>

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
