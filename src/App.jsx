import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SystemProvider } from './context/SystemContext';
import { MainLayout } from './components/layout/MainLayout';

// Páginas
import { OverviewPage } from './pages/OverviewPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { MemoryPage } from './pages/MemoryPage';
import { DevicesPage } from './pages/DevicesPage';
import { LogsAlertsPage } from './pages/LogsAlertsPage';
import { LoginPage } from './pages/LoginPage';
import { TwinPage } from './pages/TwinPage';
import { FaultInjectionPage } from './pages/FaultInjectionPage';
import { TerminalPage } from './pages/TerminalPage';
import { KernelPage } from './pages/KernelPage';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('overview');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'overview':
        return <OverviewPage onNavigate={setCurrentScreen} />;
      case 'processes':
        return <ProcessesPage onNavigate={setCurrentScreen} />;
      case 'memory':
        return <MemoryPage onNavigate={setCurrentScreen} />;
      case 'devices':
        return <DevicesPage onNavigate={setCurrentScreen} />;
      case 'logs-alerts':
        return <LogsAlertsPage onNavigate={setCurrentScreen} />;
      case 'login':
        return <LoginPage onNavigate={setCurrentScreen} />;
      case 'twin':
        return <TwinPage onNavigate={setCurrentScreen} />;
      case 'fault-injection':
        return <FaultInjectionPage onNavigate={setCurrentScreen} />;
      case 'terminal':
        return <TerminalPage onNavigate={setCurrentScreen} />;
      case 'kernel':
        return <KernelPage onNavigate={setCurrentScreen} />;
      default:
        return <OverviewPage onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <AuthProvider>
      <SystemProvider>
        <MainLayout currentScreen={currentScreen} onNavigate={setCurrentScreen}>
          {renderScreen()}
        </MainLayout>
      </SystemProvider>
    </AuthProvider>
  );
}
