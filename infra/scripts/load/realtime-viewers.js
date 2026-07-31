/**
 * k6 — LingoBusiness viewer fan-out.
 *
 * The question this answers: what does it cost the server when one speaker is
 * heard by N people reading in M languages?
 *
 * The property under test is the one the whole cost model rests on: a viewer
 * is a WebSocket subscription and a translation is done *once per distinct
 * target language*, so going from 100 to 5 000 viewers must move connection
 * cost and must NOT move translation cost.
 *
 * Run:
 *   k6 run -e SCENARIO=viewers_1000 infra/scripts/load/realtime-viewers.js
 *   node infra/scripts/run-load-test.mjs --profile 5000
 *
 * Requires the API running with AI_PROVIDER=mock and ENABLE_DEV_SIMULATOR=true
 * so no provider account is billed by a load test.
 */
import ws from 'k6/ws';
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const API = __ENV.API_BASE_URL || 'http://localhost:4000';
const WS_BASE = API.replace(/^http/, 'ws');
const CODE = __ENV.ACCESS_CODE || '';
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 60);

const firstLineLatency = new Trend('ll_first_line_ms', true);
const linesReceived = new Counter('ll_lines_received');
const connectFailures = new Counter('ll_connect_failures');
const joinSuccess = new Rate('ll_join_success');

/** Viewer languages: fewer distinct languages than viewers, on purpose. */
const LANGUAGES = ['fr', 'en', 'ar', 'es', 'pt-BR', 'it', 'de'];

export const options = {
  scenarios: {
    viewers_100: {
      executor: 'ramping-vus',
      exec: 'viewer',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '10s', target: 0 },
      ],
      tags: { profile: '100' },
    },
    viewers_1000: {
      executor: 'ramping-vus',
      exec: 'viewer',
      startVUs: 0,
      stages: [
        { duration: '60s', target: 1000 },
        { duration: '120s', target: 1000 },
        { duration: '20s', target: 0 },
      ],
      tags: { profile: '1000' },
      startTime: '0s',
    },
    viewers_5000: {
      executor: 'ramping-vus',
      exec: 'viewer',
      startVUs: 0,
      stages: [
        { duration: '120s', target: 5000 },
        { duration: '180s', target: 5000 },
        { duration: '30s', target: 0 },
      ],
      tags: { profile: '5000' },
      startTime: '0s',
    },
  },
  thresholds: {
    // A viewer must see a line within 2.5 s of it being spoken at p95. Beyond
    // that the product stops feeling live.
    ll_first_line_ms: ['p(95)<2500'],
    ll_join_success: ['rate>0.99'],
    ll_connect_failures: ['count<10'],
    http_req_duration: ['p(95)<800'],
  },
  // One scenario per run: `run-load-test.mjs` selects it.
  ...(__ENV.SCENARIO ? { scenarios: undefined } : {}),
};

export function setup() {
  if (!CODE) {
    fail(
      'ACCESS_CODE is required. Create a simulated business session first:\n' +
        '  curl -XPOST $API_BASE_URL/api/v1/dev/business/sessions -H "content-type: application/json" -d \'{"title":"load"}\'',
    );
  }
  const preview = http.get(`${API}/api/v1/business/sessions/${CODE}/preview`);
  check(preview, { 'code is joinable': (response) => response.status === 200 });
  return { code: CODE };
}

export function viewer(data) {
  const language = LANGUAGES[__VU % LANGUAGES.length];

  const joined = http.post(
    `${API}/api/v1/business/sessions/join`,
    JSON.stringify({ code: data.code, readingLanguage: language, displayName: null }),
    { headers: { 'content-type': 'application/json' }, tags: { name: 'join' } },
  );

  const ok = check(joined, { 'joined': (response) => response.status === 200 });
  joinSuccess.add(ok);
  if (!ok) {
    connectFailures.add(1);
    return;
  }

  const body = joined.json();
  const url = `${WS_BASE}/realtime?token=${encodeURIComponent(body.realtimeToken)}`;

  const openedAt = Date.now();
  let sawLine = false;

  const response = ws.connect(url, {}, (socket) => {
    socket.on('message', (raw) => {
      const event = JSON.parse(raw);
      if (event.type === 'transcript.final' || event.type === 'translation.final') {
        linesReceived.add(1);
        if (!sawLine) {
          sawLine = true;
          firstLineLatency.add(Date.now() - openedAt);
        }
      }
    });
    socket.on('error', () => connectFailures.add(1));
    // Viewers are passive: they open a socket and read. That is the load.
    socket.setTimeout(() => socket.close(), HOLD_SECONDS * 1000);
  });

  check(response, { 'websocket accepted': (r) => r && r.status === 101 });
}

export function handleSummary(data) {
  const metric = (name, field) => data.metrics[name]?.values?.[field] ?? 0;
  const summary = {
    profile: __ENV.SCENARIO || 'default',
    viewersPeak: metric('vus_max', 'value'),
    joinSuccessRate: metric('ll_join_success', 'rate'),
    firstLineP95Ms: metric('ll_first_line_ms', 'p(95)'),
    linesReceived: metric('ll_lines_received', 'count'),
    connectFailures: metric('ll_connect_failures', 'count'),
    httpP95Ms: metric('http_req_duration', 'p(95)'),
  };
  return {
    stdout: `\n${JSON.stringify(summary, null, 2)}\n`,
    'load-summary.json': JSON.stringify(summary, null, 2),
  };
}
