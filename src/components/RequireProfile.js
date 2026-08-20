import { Navigate, useLocation } from 'react-router-dom';
import { useProfiles } from './ProfileContext';

// Sits inside ProtectedRoute: the visitor is already known to be logged in,
// this just makes sure they've also picked a "Who's watching?" profile
// before landing on profile-scoped content like MovieSearch.
function RequireProfile({ children }) {
  const { activeProfile } = useProfiles();
  const location = useLocation();

  if (!activeProfile) {
    return <Navigate to="/profiles" state={{ from: location }} replace />;
  }

  return children;
}

export default RequireProfile;  