import { Redirect } from "wouter";

/**
 * Legacy route — owner command center is unified at `/dashboard`.
 */
export default function BusinessDashboardPage() {
  return <Redirect to="/dashboard" />;
}
