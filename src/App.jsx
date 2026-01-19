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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - NO Layout wrapper */}
        <Route path="/login" element={<Login />} />
        <Route path="/embed/:dealerId" element={<EmbedInventory />} />
        <Route path="/find-rig/:dealerId" element={<EmbedFindRig />} />
        
        {/* Protected routes - WITH Layout wrapper (sidebar, nav) */}
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
<Route path="/admin/dev-console" element={<AdminDevConsole />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}