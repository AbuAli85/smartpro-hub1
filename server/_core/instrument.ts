/**
 * Load before any other application modules so @sentry/node can instrument them.
 * @see https://docs.sentry.io/platforms/javascript/guides/node/
 */
import "dotenv/config";
import { initSentry } from "./sentry";

initSentry();
