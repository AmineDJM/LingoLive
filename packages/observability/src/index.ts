/**
 * @lingolive/observability — optional, off by default, incapable of carrying
 * spoken content.
 *
 * Both integrations are opt-in and vendor-neutral at the call site:
 *   - `createAnalytics()` sends only events from a closed catalogue;
 *   - `createErrorReporter()` sends only an exception type, a scrubbed
 *     message and a few enum tags.
 *
 * With `ANALYTICS_ENABLED=false` and `SENTRY_DSN` empty — the defaults — the
 * product makes no third-party network calls at all.
 */
export {
  ANALYTICS_EVENTS,
  ENUM_PROPERTIES,
  isAnalyticsEvent,
  sanitizeProperties,
  type AnalyticsEventDefinition,
  type AnalyticsEventName,
  type AnalyticsValue,
} from './events.js';

export {
  analyticsCatalogue,
  createAnalytics,
  type Analytics,
  type AnalyticsOptions,
  type AnalyticsPayload,
  type AnalyticsTransport,
} from './analytics.js';

export {
  buildEvent,
  createErrorReporter,
  envelopeUrl,
  parseDsn,
  scrubMessage,
  type ErrorReporter,
  type ErrorReporterOptions,
  type ErrorReportContext,
  type ParsedDsn,
  type ReportEvent,
} from './errors.js';
