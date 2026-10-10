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
 * Composition shell: reads `useAuth()`, resolves the best-available identifier
 * via the existing `resolveUserIdentifier` (`email → preferred_username →
 * sub`), and composes the application header plus a `<main>` landmark. The main
 * flow places the welcome section (full width) above a two-column region, with
 * the primary product workspace region (dominant, first in source order) — now
 * holding the Saved Resources section, the first real business surface — beside
 * the secondary environment status region (`ProtectedApiCard`, narrower), and
 * the static foundation strip as a full-width secondary band below. The wrapper
 * `<div>`s are presentational grid cells with no heading and no landmark role.
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

        <div className="workspace__columns">
          {/* Primary product workspace region — dominant, first in source order */}
          <div className="workspace__primary">
            <SavedResourcesSection />
          </div>
          {/* Secondary environment status region — narrower, after primary */}
          <div className="workspace__secondary">
            <ProtectedApiCard />
          </div>
        </div>

        <FoundationStrip />
      </main>
    </div>
  );
};
