import App from './App.js';
import { AppDataProvider } from './services/AppDataContext.js';
import { AuthProvider, namespaceFor, useAuth } from './services/AuthContext.js';
import { SyncProvider } from './services/SyncContext.js';
import PublicSite from './pages/PublicSite.js';
import ChangePasswordPage from './pages/ChangePasswordPage.js';
import PlatformPage from './pages/PlatformPage.js';
import RoleToast from './components/RoleToast.js';

function Gate() {
  const { mode, session } = useAuth();

  // Server mode: nothing is shown until someone is signed in. (Local data stays on this computer while signed out.)
  if (mode === 'cloud' && !session) return <PublicSite />;
  if (mode === 'cloud' && session?.user.mustChangePassword) return <ChangePasswordPage />;
  if (mode === 'cloud' && session?.user.role === 'super_admin') return <PlatformPage />;

  // keyed by database so switching organization or mode remounts everything on the right local database
  const ns = namespaceFor(mode, session) ?? 'local';
  return (
    <AppDataProvider key={ns}>
      <SyncProvider>
        <App />
        <RoleToast />
      </SyncProvider>
    </AppDataProvider>
  );
}

export default function AuthGate() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
