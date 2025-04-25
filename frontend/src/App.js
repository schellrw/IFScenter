import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import { IFSProvider } from './context/IFSContext';
import { 
  Dashboard, 
  PartsView, 
  JournalPage, 
  Login, 
  Register,
  NewPartPage, 
  SystemMapPage, 
  PartDetailsPage,
  GuidedSessionChatPage,
  GuidedSessionsPage,
  PricingPage,
  AccountSettings,
  PaymentSuccessPage,
  PaymentCancelPage,
  PrivacyPolicyPage,
  TermsOfServicePage
} from './pages';
import { 
  Navigation, 
  ProtectedRoute, 
  SessionExpiryWarning 
} from './components';
import { ErrorBoundary } from 'react-error-boundary';
import { injectDebugger } from './debug-helper';
import Footer from './components/Footer';

// Initialize debug tools
injectDebugger();

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
  },
});

function ErrorFallback({error}) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
    </div>
  )
}

// Custom wrapper for protected routes with IFSProvider
const ProtectedIFSRoute = ({ children }) => {
  return (
    <ProtectedRoute>
      <IFSProvider>
        {children}
      </IFSProvider>
    </ProtectedRoute>
  );
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <div className="App">
            <Navigation />
            <SessionExpiryWarning />
            <Box sx={{ p: 2 }}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={<ProtectedIFSRoute><Dashboard /></ProtectedIFSRoute>} />
                <Route path="/parts" element={<ProtectedIFSRoute><PartsView /></ProtectedIFSRoute>} />
                <Route path="/parts/new" element={<ProtectedIFSRoute><NewPartPage /></ProtectedIFSRoute>} />
                <Route path="/parts/:partId" element={<ProtectedIFSRoute><PartDetailsPage /></ProtectedIFSRoute>} />
                <Route path="/session/:sessionId" element={<ProtectedIFSRoute><GuidedSessionChatPage /></ProtectedIFSRoute>} />
                <Route path="/sessions" element={<ProtectedIFSRoute><GuidedSessionsPage /></ProtectedIFSRoute>} />
                <Route path="/journal" element={<ProtectedIFSRoute><JournalPage /></ProtectedIFSRoute>} />
                <Route path="/system-map" element={<ProtectedIFSRoute><ErrorBoundary FallbackComponent={ErrorFallback}><SystemMapPage /></ErrorBoundary></ProtectedIFSRoute>} />
                <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
                <Route path="/account-settings" element={<ProtectedIFSRoute><AccountSettings /></ProtectedIFSRoute>} />
                <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccessPage /></ProtectedRoute>} />
                <Route path="/payment/cancel" element={<ProtectedRoute><PaymentCancelPage /></ProtectedRoute>} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms-of-service" element={<TermsOfServicePage />} />
              </Routes>
            </Box>
            <Footer />
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App; 