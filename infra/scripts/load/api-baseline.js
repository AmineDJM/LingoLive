/**
 * k6 — HTTP baseline.
 *
 * The realtime scenario measures fan-out. This one measures the request path
 * everything else depends on: guest registration, session creation, code
 * preview and the health endpoints. If these degrade, the realtime numbers are
 * meaningless.
 *
 * Run:
 *   k6 run infra/scripts/load/api-baseline.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const API = __ENV.API_BASE_URL || 'http://localhost:4000';
const CODE = __ENV.ACCESS_CODE || '';

const registerLatency = new Trend('ll_register_ms', true);
const createLatency = new Trend('ll_create_session_ms', true);

export const options = {
  scenarios: {
    api: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600', 'p(99)<1500'],
    ll_register_ms: ['p(95)<400'],
    ll_create_session_ms: ['p(95)<500'],
  },
};

export default function apiBaseline() {
  group('health', () => {
    const response = http.get(`${API}/health`, { tags: { name: 'health' } });
    check(response, { 'health ok': (r) => r.status === 200 });
  });

  let token = null;

  group('register guest', () => {
    const response = http.post(
      `${API}/api/v1/auth/guest`,
      JSON.stringify({
        anonymousId: `anon_load_${__VU}_${__ITER}`,
        platform: 'web',
        appVersion: '1.0.0',
        locale: 'en',
      }),
      { headers: { 'content-type': 'application/json' }, tags: { name: 'register' } },
    );
    registerLatency.add(response.timings.duration);
    if (check(response, { registered: (r) => r.status === 200 })) {
      token = response.json().accessToken;
    }
  });

  if (token) {
    group('create session', () => {
      const response = http.post(
        `${API}/api/v1/sessions`,
        JSON.stringify({ kind: 'PERSONAL_LISTEN', readingLanguage: 'fr' }),
        {
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          tags: { name: 'create-session' },
        },
      );
      createLatency.add(response.timings.duration);
      // 429 is a *correct* answer under load, not a failure of the server.
      check(response, { 'created or throttled': (r) => r.status === 201 || r.status === 429 });

      if (response.status === 201) {
        const sessionId = response.json().session.id;
        http.post(
          `${API}/api/v1/sessions/${sessionId}/end`,
          JSON.stringify({ reportedAudioSeconds: 0 }),
          {
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            tags: { name: 'end-session' },
          },
        );
      }
    });
  }

  if (CODE) {
    group('code preview', () => {
      const response = http.get(`${API}/api/v1/business/sessions/${CODE}`, {
        tags: { name: 'preview' },
      });
      check(response, { 'preview ok': (r) => r.status === 200 });
    });
  }

  sleep(1);
}
