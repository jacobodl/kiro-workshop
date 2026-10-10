import { useAuth } from 'react-oidc-context';
import { resolveUserIdentifier } from '../../lib/auth/user-utils';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WelcomeSection } from './WelcomeSection';
import { ProtectedApiCard } from './ProtectedApiCard';
import { FoundationStrip } from './FoundationStrip';
import { SavedResourcesSection } from '../resources/SavedResourcesSection';
import './WorkspacePage.css';

/**
 * Authenticated Workshop Workspace page (served at `/home` inside
 * `ProtectedRoute`), replacing the previous minimal `HomePage`.
 *
 * Composition shell (task 3.1): reads `useAuth()`, resolves the best-available
 * identifier via the existing `resolveUserIdentifier` (`email →
 * preferred_username → sub`), and composes the application header plus a
 * `<main>` landmark containing the welcome section, the protected-API status
 * area, the secondary static foundation strip, and the Saved Resources
 * section.
 *
 * This page owns no business state and uses no global store. The only runtime
 * state lives locally inside `ProtectedApiCard` (request status) and
 * `AccountMenu` (open/closed), added in later tasks. The single page `h1` lives
 * in `WelcomeSection`; the header identity and section titles use `h2`/`h3`.
 */
export const WorkspacePage = () => {
  const auth = useAuth();

  const identifier = auth.user?.profile
    ? resolveUserIdentifier({
        email: auth.user.profile.email,
        preferred_username: auth.user.profile.preferred_username,
        sub: auth.user.profile.sub,
      })
    : '';

  return (
    <div className="workspace">
      <WorkspaceHeader identifier={identifier} />
      <main className="workspace__main">
        <WelcomeSection />
        <ProtectedApiCard />
        <FoundationStrip />
        <SavedResourcesSection />
      </main>
    </div>
  );
};
