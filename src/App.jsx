import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import DealsPage from './pages/DealsPage';
import BHPHPage from './pages/BHPHPage';
import ResearchPage from './pages/ResearchPage';
import DealFinderPage from './pages/DealFinderPage';
import SettingsPage from './pages/SettingsPage';
import EmbedInventory from './pages/EmbedInventory';
import EmbedFindRig from './pages/EmbedFindRig';
import CustomersPage from './pages/CustomersPage';
import EmailMarketingPage from './pages/EmailMarketingPage';
import TeamPage from './pages/TeamPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeSetupPage from './pages/EmployeeSetupPage';
import CommissionsPage from './pages/CommissionsPage';
import BooksPage from './pages/BooksPage';
import ReportsPage from './pages/ReportsPage';
import DocumentRulesPage from './pages/DocumentRulesPage';
import AdminDevConsole from './pages/AdminDevConsole';
import TimeClockPage from './pages/TimeClockPage';
import PayrollPage from './pages/PayrollPage';
import DevConsolePage from './pages/DevConsolePage';
import StateUpdatesPage from './pages/StateUpdatesPage';
import DataImportPage from './pages/DataImportPage';
import MarketplaceSettingsPage from './pages/MarketplaceSettingsPage';
import InvestorLogin from './pages/InvestorLogin';
import InvestorDashboard from './pages/InvestorDashboard';
import InvestorPortfolio from './pages/InvestorPortfolio';
import InvestorCapital from './pages/InvestorCapital';
import InvestorBankAccount from './pages/InvestorBankAccount';
import InvestorSettings from './pages/InvestorSettings';
import InvestorReports from './pages/InvestorReports';
import InvestorAccreditation from './pages/InvestorAccreditation';
import InvestorAnalytics from './pages/InvestorAnalytics';
import InvestorNotifications from './pages/InvestorNotifications';
import AdminInvestorDashboard from './pages/AdminInvestorDashboard';
import SMSPage from './pages/SMSPage';
import AppointmentsPage from './pages/AppointmentsPage';
import ESignaturePage from './pages/ESignaturePage';
import DealerNotificationsPage from './pages/DealerNotificationsPage';
import AdvancedAnalyticsPage from './pages/AdvancedAnalyticsPage';
import ComplianceDashboard from './pages/ComplianceDashboard';
import MarketplaceListingsPage from './pages/MarketplaceListingsPage';
import CRMWorkflowsPage from './pages/CRMWorkflowsPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import LeadsPage from './pages/LeadsPage';
import ReconditioningPage from './pages/ReconditioningPage';
import VehicleTrackingPage from './pages/VehicleTrackingPage';
import TradeInsPage from './pages/TradeInsPage';
import DealTimelinePage from './pages/DealTimelinePage';
import VehicleDetailPage from './pages/VehicleDetailPage';
import FloorPlanPage from './pages/FloorPlanPage';
import FIProductsPage from './pages/FIProductsPage';
import AuctionPage from './pages/AuctionPage';
import PhotoManagementPage from './pages/PhotoManagementPage';
import TitleTrackingPage from './pages/TitleTrackingPage';
import VendorManagementPage from './pages/VendorManagementPage';
import TestDrivePage from './pages/TestDrivePage';
import KeyTrackingPage from './pages/KeyTrackingPage';
import WarrantyClaimsPage from './pages/WarrantyClaimsPage';
import TaskManagementPage from './pages/TaskManagementPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/employee-setup" element={<EmployeeSetupPage />} />
        <Route path="/embed/:dealerId" element={<EmbedInventory />} />
        <Route path="/find-rig/:dealerId" element={<EmbedFindRig />} />

        {/* Investor Portal routes (no layout) */}
        <Route path="/investor/login" element={<InvestorLogin />} />
        <Route path="/investor/dashboard" element={<InvestorDashboard />} />
        <Route path="/investor/portfolio" element={<InvestorPortfolio />} />
        <Route path="/investor/capital" element={<InvestorCapital />} />
        <Route path="/investor/bank-account" element={<InvestorBankAccount />} />
        <Route path="/investor/settings" element={<InvestorSettings />} />
        <Route path="/investor/reports" element={<InvestorReports />} />
        <Route path="/investor/accreditation" element={<InvestorAccreditation />} />
        <Route path="/investor/analytics" element={<InvestorAnalytics />} />
        <Route path="/investor/notifications" element={<InvestorNotifications />} />

        {/* Protected routes with Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/bhph" element={<BHPHPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/email-marketing" element={<EmailMarketingPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/commissions" element={<CommissionsPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/document-rules" element={<DocumentRulesPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/deal-finder" element={<DealFinderPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<DataImportPage />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPage />} />
          <Route path="/timeclock" element={<TimeClockPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/dev" element={<DevConsolePage />} />
          <Route path="/admin/dev-console" element={<AdminDevConsole />} />
          <Route path="/admin/state-updates" element={<StateUpdatesPage />} />
          <Route path="/admin/investors" element={<AdminInvestorDashboard />} />
          <Route path="/sms" element={<SMSPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/esignature" element={<ESignaturePage />} />
          <Route path="/notifications" element={<DealerNotificationsPage />} />
          <Route path="/analytics" element={<AdvancedAnalyticsPage />} />
          <Route path="/compliance" element={<ComplianceDashboard />} />
          <Route path="/marketplace-listings" element={<MarketplaceListingsPage />} />
          <Route path="/crm-workflows" element={<CRMWorkflowsPage />} />
          <Route path="/customer-portal" element={<CustomerPortalPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/reconditioning" element={<ReconditioningPage />} />
          <Route path="/vehicle-tracking" element={<VehicleTrackingPage />} />
          <Route path="/trade-ins" element={<TradeInsPage />} />
          <Route path="/deal-timeline" element={<DealTimelinePage />} />
          <Route path="/vehicle/:id" element={<VehicleDetailPage />} />
          <Route path="/floor-plan" element={<FloorPlanPage />} />
          <Route path="/fi-products" element={<FIProductsPage />} />
          <Route path="/auctions" element={<AuctionPage />} />
          <Route path="/photos" element={<PhotoManagementPage />} />
          <Route path="/titles" element={<TitleTrackingPage />} />
          <Route path="/vendors" element={<VendorManagementPage />} />
          <Route path="/test-drives" element={<TestDrivePage />} />
          <Route path="/keys" element={<KeyTrackingPage />} />
          <Route path="/warranty-claims" element={<WarrantyClaimsPage />} />
          <Route path="/tasks" element={<TaskManagementPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}