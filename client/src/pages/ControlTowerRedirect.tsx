import { Redirect } from "wouter";

/** Canonical executive home is `/dashboard`; `/control-tower` kept for bookmarks. */
export default function ControlTowerRedirect() {
  return <Redirect to="/dashboard" />;
}
