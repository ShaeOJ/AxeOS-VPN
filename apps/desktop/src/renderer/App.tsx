import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TitleBar } from './components/TitleBar';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { Layout } from './components/Layout';

export function App() {
  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TitleBar />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="devices/:deviceId" element={<DeviceDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
