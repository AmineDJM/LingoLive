/**
 * @lingolive/realtime-core — the platform-independent brain of a live session.
 *
 * Everything here is pure TypeScript with injectable timers and sockets, so
 * the web app, the mobile app and the test suite all exercise the same code
 * paths. No DOM, no React Native, no Node built-ins.
 */
export * from './state-machine.js';
export * from './transcript-store.js';
export * from './session-client.js';
export * from './mock-transport.js';
export * from './webrtc-transport.js';
export * from './discussion.js';
export * from './deep-links.js';
