'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminMetricsResponse,
  AdminOverview,
  AdminRealtimeResponse,
  AdminSessionRow,
  AdminUsageResponse,
  AdminUserRow,
} from '@lingolive/contracts';
import { ApiClient } from '@lingolive/api-client';
import { apiUrl } from '@/lib/site';
import { ensureToken } from '@/lib/client';
import { Alert, Badge, Button, Card, cx } from './ui';

/**
 * The operator console.
 *
 * Design intent (ADR 0010): total visibility over the *system*, and a
 * deliberate gate on the *content* of what people said. Everything on this
 * screen is system state — sessions, connections, cost, latency, errors,
 * configuration. Reading a transcript requires a separate action with a
 * written reason, and that action is audited permanently.
 *
 * The admin token is held in memory for the session only. It is never written
 * to storage, so a shared machine does not leak it.
 */

type Tab =
  'overview' | 'sessions' | 'users' | 'usage' | 'realtime' | 'metrics' | 'config' | 'audit';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'users', label: 'Users' },
  { id: 'usage', label: 'Usage & cost' },
  { id: 'realtime', label: 'Realtime' },
  { id: 'metrics', label: 'Performance' },
  { id: 'config', label: 'Configuration' },
  { id: 'audit', label: 'Audit log' },
];

export function AdminConsole() {
  const [adminToken, setAdminToken] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const client = useCallback(
    () =>
      new ApiClient({
        baseUrl: apiUrl,
        getToken: () => ensureToken(),
        headers: { 'x-admin-token': adminToken },
      }),
    [adminToken],
  );

  const load = useCallback(
    async (which: Tab) => {
      setLoading(true);
      setError(null);
      try {
        const api = client();
        const path =
          which === 'overview'
            ? '/admin/overview'
            : which === 'sessions'
              ? '/admin/sessions?limit=50'
              : which === 'users'
                ? '/admin/users?limit=50'
                : which === 'usage'
                  ? '/admin/usage?granularity=day'
                  : which === 'realtime'
                    ? '/admin/realtime'
                    : which === 'metrics'
                      ? '/admin/metrics'
                      : which === 'config'
                        ? '/admin/config'
                        : '/admin/audit?limit=50';
        const response = await api.get<unknown>(path);
        setData((current) => ({ ...current, [which]: response }));
        setAuthorised(true);
      } catch (caught) {
        const code =
          typeof caught === 'object' && caught && 'code' in caught
            ? String((caught as { code: unknown }).code)
            : 'INTERNAL_ERROR';
        setError(code);
        if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'ADMIN_TOKEN_REQUIRED') {
          setAuthorised(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (authorised) void load(tab);
  }, [authorised, tab, load]);

  if (!authorised) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <h1 className="text-2xl font-bold text-ink">Operator console</h1>
          <p className="mt-2 text-[15px] text-ink-secondary">
            Requires an administrator account and the deployment&apos;s admin token. The token is
            kept in memory only and is never stored in this browser.
          </p>
          <label className="mt-6 block">
            <span className="mb-2 block text-[15px] font-medium text-ink">X-Admin-Token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              autoComplete="off"
              data-testid="admin-token"
              className="w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 font-mono text-[15px] text-ink"
            />
          </label>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            className="mt-4 w-full"
            onClick={() => void load('overview')}
            disabled={!adminToken}
          >
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">Operator console</h1>
        <Badge tone="warning">admin</Badge>
        <Button variant="secondary" className="ms-auto" onClick={() => void load(tab)}>
          Refresh
        </Button>
      </header>

      <nav aria-label="Console sections" className="mt-4 overflow-x-auto">
        <ul className="flex gap-1">
          {TABS.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? 'page' : undefined}
                data-testid={`admin-tab-${entry.id}`}
                className={cx(
                  'whitespace-nowrap rounded-[var(--radius-md)] px-4 py-2.5 text-[14px] font-medium',
                  tab === entry.id
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-secondary hover:bg-primary-soft',
                )}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {error ? (
        <Alert tone="danger" title="Request failed">
          {error}
        </Alert>
      ) : null}

      <div className="mt-5">
        {loading && !data[tab] ? (
          <p className="py-12 text-center text-ink-muted">Loading…</p>
        ) : tab === 'overview' ? (
          <OverviewPanel overview={data.overview as AdminOverview | undefined} />
        ) : tab === 'sessions' ? (
          <SessionsPanel rows={(data.sessions as { items?: AdminSessionRow[] })?.items ?? []} />
        ) : tab === 'users' ? (
          <UsersPanel rows={(data.users as { items?: AdminUserRow[] })?.items ?? []} />
        ) : tab === 'usage' ? (
          <UsagePanel usage={data.usage as AdminUsageResponse | undefined} />
        ) : tab === 'realtime' ? (
          <RealtimePanel realtime={data.realtime as AdminRealtimeResponse | undefined} />
        ) : tab === 'metrics' ? (
          <MetricsPanel metrics={data.metrics as AdminMetricsResponse | undefined} />
        ) : (
          <RawPanel value={data[tab]} />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <p className="text-[13px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p
        className={cx(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'bad'
            ? 'text-danger'
            : tone === 'warn'
              ? 'text-[var(--color-warning)]'
              : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OverviewPanel({ overview }: { overview?: AdminOverview }) {
  if (!overview) return null;
  const health = overview.health;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Live right now</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Active sessions" value={overview.live.activeSessions} />
          <Stat label="Connected clients" value={overview.live.connectedClients} />
          <Stat label="Business viewers" value={overview.live.businessViewers} />
          <Stat label="Speaking now" value={overview.live.speakingNow} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Today</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Sessions" value={overview.today.sessionsStarted} />
          <Stat label="Audio minutes" value={overview.today.audioMinutes} />
          <Stat label="Segments" value={overview.today.segments} />
          <Stat label="Translations" value={overview.today.translations} />
          <Stat label="Unique users" value={overview.today.uniqueUsers} />
          <Stat label="New users" value={overview.today.newUsers} />
          <Stat label="Estimated cost" value={`$${overview.today.estimatedCostUsd.toFixed(4)}`} />
          <Stat
            label="Errors"
            value={overview.today.errors}
            tone={overview.today.errors > 0 ? 'warn' : 'ok'}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Health</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(health).map(([key, value]) => (
            <Stat
              key={key}
              label={key}
              value={String(value)}
              tone={
                value === 'ok' || value === 'closed' || value === 'mock'
                  ? 'ok'
                  : value === 'error' || value === 'open'
                    ? 'bad'
                    : 'warn'
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Totals & process</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Users" value={overview.totals.users} />
          <Stat label="Guests" value={overview.totals.guests} />
          <Stat label="Sessions" value={overview.totals.sessions} />
          <Stat label="Saved" value={overview.totals.savedSessions} />
          <Stat label="Segments" value={overview.totals.segments} />
          <Stat label="Translations" value={overview.totals.translations} />
          <Stat label="Pro subscribers" value={overview.totals.proSubscribers} />
          <Stat
            label="Event loop p99"
            value={`${overview.process.eventLoopDelayP99Ms} ms`}
            tone={overview.process.eventLoopDelayP99Ms > 100 ? 'warn' : 'ok'}
          />
          <Stat label="RSS" value={`${Math.round(overview.process.rssBytes / 1024 / 1024)} MB`} />
          <Stat label="Uptime" value={`${Math.round(overview.process.uptimeSeconds / 60)} min`} />
          <Stat label="Node" value={overview.process.nodeVersion} />
          <Stat label="Environment" value={overview.process.environment} />
        </div>
      </section>
    </div>
  );
}

function SessionsPanel({ rows }: { rows: AdminSessionRow[] }) {
  return (
    <Table
      headers={['Session', 'Kind', 'Status', 'Segments', 'Connected', 'Languages', 'Cost']}
      rows={rows.map((row) => [
        row.title ?? row.id.slice(0, 10),
        row.kind.replace('PERSONAL_', '').replace('BUSINESS_', ''),
        row.status,
        String(row.segmentCount),
        String(row.connectedNow),
        row.languages.join(', ') || '—',
        `$${row.estimatedCostUsd.toFixed(4)}`,
      ])}
      caption="Transcript content is not shown here. Reading it requires an explicit, audited reveal."
    />
  );
}

function UsersPanel({ rows }: { rows: AdminUserRow[] }) {
  return (
    <Table
      headers={['User', 'Plan', 'Guest', 'Sessions', 'Audio (min)', 'Devices', 'Cost']}
      rows={rows.map((row) => [
        row.email ?? row.displayName ?? row.id.slice(0, 12),
        row.plan,
        row.isGuest ? 'yes' : 'no',
        String(row.sessionCount),
        (row.audioSeconds / 60).toFixed(1),
        String(row.deviceCount),
        `$${row.estimatedCostUsd.toFixed(4)}`,
      ])}
    />
  );
}

function UsagePanel({ usage }: { usage?: AdminUsageResponse }) {
  if (!usage) return null;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Spent today" value={`$${usage.limits.spentTodayUsd.toFixed(4)}`} />
        <Stat label="Daily limit" value={`$${usage.limits.dailyLimitUsd}`} />
        <Stat label="Spent this month" value={`$${usage.limits.spentThisMonthUsd.toFixed(4)}`} />
        <Stat
          label="Circuit breaker"
          value={usage.limits.circuitBreakerOpen ? 'OPEN' : 'closed'}
          tone={usage.limits.circuitBreakerOpen ? 'bad' : 'ok'}
        />
      </div>
      <Table
        headers={['Bucket', 'Audio (s)', 'Translations', 'Input tokens', 'Output tokens', 'Cost']}
        rows={usage.buckets.map((bucket) => [
          bucket.bucket.slice(0, 10),
          bucket.audioSeconds.toFixed(0),
          String(bucket.translationRequests),
          String(bucket.inputTokens),
          String(bucket.outputTokens),
          `$${bucket.estimatedCostUsd.toFixed(4)}`,
        ])}
      />
      <Table
        headers={['Provider', 'Model', 'Metric', 'Quantity', 'Cost']}
        rows={usage.byModel.map((row) => [
          row.provider,
          row.model,
          row.metric,
          row.quantity.toFixed(0),
          `$${row.estimatedCostUsd.toFixed(4)}`,
        ])}
      />
    </div>
  );
}

function RealtimePanel({ realtime }: { realtime?: AdminRealtimeResponse }) {
  if (!realtime) return null;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Connections" value={realtime.totals.connections} />
        <Stat label="Rooms" value={realtime.totals.rooms} />
        <Stat label="Messages / min" value={realtime.totals.messagesPerMinute} />
      </div>
      <Table
        headers={['Room', 'Subscribers', 'Languages', 'Fan-out ratio', 'Last sequence']}
        rows={realtime.rooms.map((room) => [
          room.sessionId.slice(0, 10),
          String(room.subscribers),
          room.activeLanguages.join(', ') || '—',
          `${room.fanOutRatio}×`,
          String(room.lastSequence),
        ])}
        caption="Fan-out ratio is viewers served per translation performed — the higher it is, the better the design is working."
      />
      <Table
        headers={['Connection', 'Role', 'Language', 'Sent', 'Received', 'Network']}
        rows={realtime.connections.map((connection) => [
          connection.connectionId.slice(0, 8),
          connection.role,
          connection.targetLanguage ?? '—',
          String(connection.messagesSent),
          String(connection.messagesReceived),
          connection.networkPrefix ?? '—',
        ])}
      />
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics?: AdminMetricsResponse }) {
  if (!metrics) return null;
  return (
    <div className="space-y-6">
      <Table
        headers={['Measurement', 'Count', 'p50', 'p95', 'p99', 'max']}
        rows={metrics.latency.map((entry) => [
          entry.name,
          String(entry.count),
          `${entry.p50Ms} ms`,
          `${entry.p95Ms} ms`,
          `${entry.p99Ms} ms`,
          `${entry.maxMs} ms`,
        ])}
      />
      <Table
        headers={['Route', 'Method', 'Count', 'Errors', 'p95']}
        rows={metrics.http.map((entry) => [
          entry.route,
          entry.method,
          String(entry.count),
          String(entry.errorCount),
          `${entry.p95Ms} ms`,
        ])}
      />
      <Table
        headers={['When', 'Code', 'Route', 'Count', 'Request id']}
        rows={metrics.recentErrors.map((entry) => [
          entry.at.slice(11, 19),
          entry.code,
          entry.route ?? '—',
          String(entry.count),
          entry.requestId,
        ])}
      />
    </div>
  );
}

function RawPanel({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-surface p-4 font-mono text-[12px] leading-relaxed text-ink">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function Table({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: string[][];
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
      <table className="w-full border-collapse text-[14px]">
        {caption ? (
          <caption className="p-3 text-start text-[13px] text-ink-muted">{caption}</caption>
        ) : null}
        <thead>
          <tr className="bg-surface">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap p-3 text-start font-semibold text-ink"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="p-6 text-center text-ink-muted">
                Nothing to show.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap p-3 text-ink-secondary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
