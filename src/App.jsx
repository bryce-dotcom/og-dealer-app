import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import DealsPage from './pages/DealsPage';
import BHPHPage from './pages/BHPHPage';
import ResearchPage from './pages/ResearchPage';
import SettingsPage from './pages/SettingsPage';
import EmbedInventory from './pages/EmbedInventory';
import EmbedFindRig from './pages/EmbedFindRig';
import CustomersPage from './pages/CustomersPage';
import TeamPage from './pages/TeamPage';
import CommissionsPage from './pages/CommissionsPage';
import BooksPage from './pages/BooksPage';
import ReportsPage from './pages/ReportsPage';
import DocumentRulesPage from './pages/DocumentRulesPage';
import AdminDevConsole from './pages/AdminDevConsole';
import TimeClockPage from './pages/TimeClockPage';
import PayrollPage from './pages/PayrollPage';
import DevConsolePage from './pages/DevConsolePage';
import StateUpdatesPage from './pages/StateUpdatesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/embed/:dealerId" element={<EmbedInventory />} />
        <Route path="/find-rig/:dealerId" element={<EmbedFindRig />} />
        
        {/* Protected routes with Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/bhph" element={<BHPHPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/commissions" element={<CommissionsPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/document-rules" element={<DocumentRulesPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/timeclock" element={<TimeClockPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/dev" element={<DevConsolePage />} />
          <Route path="/admin/dev-console" element={<AdminDevConsole />} />
          <Route path="/admin/state-updates" element={<StateUpdatesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}