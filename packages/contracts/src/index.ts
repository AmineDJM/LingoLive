/**
 * @lingolive/contracts — the single source of truth shared by the API, the
 * web app, the mobile app and the tests.
 *
 * Nothing in here imports a runtime, a database or a framework: it is pure
 * types + Zod schemas + small pure functions, so it runs identically in Node,
 * the browser and Hermes.
 */
export * from './languages.js';
export * from './locales.js';
export * from './errors.js';
export * from './session.js';
export * from './transcript.js';
export * from './entitlements.js';
export * from './realtime.js';
export * from './http.js';
export * from './urls.js';
export * from './admin.js';

/** Bumped together with any breaking change to the HTTP or WS contracts. */
export const CONTRACTS_VERSION = '1.0.0';
