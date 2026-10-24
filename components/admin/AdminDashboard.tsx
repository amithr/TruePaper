"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { planName } from "@/components/billing/PlanPicker";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EntityListSearch } from "@/components/lists/EntityList";
import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import { TeacherAvatar } from "@/components/TeacherAvatar";
import { TeacherTopBar } from "@/components/TeacherTopBar";
import type { AdminOverview, AdminUserDetail, AdminUserRow } from "@/lib/admin/types";
import { isPlanId, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import { deferEffect } from "@/lib/defer-effect";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { requestJson } from "@/lib/request-json";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  currentUserId: string;
};

const PAGE = 50;

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** Effective plan label for a list row (override beats Stripe; nothing = Free). */
function rowPlan(u: AdminUserRow): PlanId {
  if (u.planOverride && isPlanId(u.planOverride)) {
    return u.planOverride;
  }
  const live = u.billingStatus === "active" || u.billingStatus === "trialing" || u.billingStatus === "past_due";
  return live && isPlanId(u.billingPlan) ? u.billingPlan : "free";
}

export function AdminDashboard({ currentUserId }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await requestJson<AdminOverview>("/api/admin/overview"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.errors.notConfigured"));
    }
  }, [t]);

  useEffect(() => {
    deferEffect(() => void loadOverview());
  }, [loadOverview]);

  const loadUsers = useCallback(
    async (q: string, offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q) {
        params.set("q", q);
      }
      try {
        const res = await requestJson<{ total: number; users: AdminUserRow[] }>(`/api/admin/users?${params.toString()}`);
        setTotal(res.total);
        setUsers((prev) => (offset === 0 ? res.users : [...prev, ...res.users]));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("admin.users.loadFailed"));
      } finally {
        setUsersLoading(false);
      }
    },
    [t],
  );

  // Debounced search; the first run (empty query) is the initial list.
  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(query.trim(), 0), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, loadUsers]);

  const toggleBilling = async (next: boolean) => {
    if (!overview) {
      return;
    }
    setBillingBusy(true);
    const prev = overview;
    setOverview({ ...overview, billingEnabled: next });
    try {
      await requestJson<{ ok: true }>("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingEnabled: next }),
      });
      toast.success(next ? t("admin.billing.on") : t("admin.billing.off"));
    } catch (e) {
      setOverview(prev);
      setError(e instanceof Error ? e.message : t("admin.billing.saveFailed"));
    } finally {
      setBillingBusy(false);
    }
  };

  const patchRow = (id: string, patch: Partial<AdminUserRow>) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <TeacherTopBar />
        <Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("admin.title") }]} />

        <section className="tp-card-accent p-6 sm:p-8 tp-anim-fade-up">
          <p className={ui.sectionTitle}>{t("admin.eyebrow")}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ShieldCheck aria-hidden className="h-7 w-7 text-[var(--tp-brand)]" />
            {t("admin.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--tp-text-secondary)]">{t("admin.sub")}</p>
          {overview ? (
            <dl className="tp-admin-stats mt-5" data-testid="admin-stats">
              {(
                [
                  ["users", overview.users],
                  ["teachers", overview.teachers],
                  ["paid", overview.paid],
                  ["forms", overview.forms],
                  ["sessionsWeek", overview.sessionsLast7Days],
                  ["submissions", overview.submissions],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <dd className={ui.statValue}>{value}</dd>
                  <dt className={ui.statLabel}>{t(`admin.overview.${key}`)}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </section>

        {error ? (
          <p className={ui.alertError} role="alert">
            {error}
          </p>
        ) : null}

        <section className="tp-card tp-settings-section" aria-labelledby="admin-billing-title">
          <p className={ui.sectionTitle}>{t("admin.billing.eyebrow")}</p>
          <h2 id="admin-billing-title" className="tp-settings-section__title">
            {t("admin.billing.title")}
          </h2>
          <div className="tp-settings-rules">
            <SettingsSwitch
              id="admin-billing-enabled"
              label={overview?.billingEnabled === false ? t("admin.billing.off") : t("admin.billing.on")}
              hint={t("admin.billing.hint")}
              checked={overview?.billingEnabled !== false}
              dimmed={!overview || billingBusy}
              onChange={(next) => void toggleBilling(next)}
            />
          </div>
        </section>

        <section className="tp-card tp-settings-section" aria-labelledby="admin-users-title">
          {selectedId ? (
            <AdminUserPanel
              userId={selectedId}
              isSelf={selectedId === currentUserId}
              onBack={() => setSelectedId(null)}
              onChanged={(patch) => patchRow(selectedId, patch)}
              onError={setError}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className={ui.sectionTitle}>{t("admin.users.eyebrow")}</p>
                  <h2 id="admin-users-title" className="tp-settings-section__title">
                    {t("admin.users.title")}
                    <span className="ml-2 text-sm font-normal text-[var(--tp-text-muted)]">
                      {t("admin.users.count", { shown: users.length, total })}
                    </span>
                  </h2>
                </div>
                <EntityListSearch
                  value={query}
                  onChange={setQuery}
                  label={t("admin.users.searchLabel")}
                  placeholder={t("admin.users.searchPlaceholder")}
                  className="w-full sm:w-80"
                />
              </div>

              <div className="tp-admin-users mt-4" role="list" aria-busy={usersLoading}>
                {users.map((u) => {
                  const plan = rowPlan(u);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="listitem"
                      className={`tp-admin-user-row ${focusRing}`}
                      onClick={() => setSelectedId(u.id)}
                      data-testid="admin-user-row"
                    >
                      <TeacherAvatar size="sm" name={u.displayName} email={u.email} avatarUrl={u.avatarUrl} />
                      <span className="min-w-0">
                        <span className="tp-admin-user-row__name">
                          {u.displayName || u.email || u.id}
                          {u.isAdmin ? <span className="tp-settings-badge tp-settings-badge--brand">{t("admin.users.adminBadge")}</span> : null}
                          {u.id === currentUserId ? <span className="tp-settings-badge">{t("admin.users.you")}</span> : null}
                          {u.role === "student" ? <span className="tp-settings-badge">{t("admin.users.roleStudent")}</span> : null}
                        </span>
                        <span className="tp-admin-user-row__meta">
                          {u.email} · {t("admin.users.joined", { date: fmtDate(u.createdAt, locale) })}
                        </span>
                      </span>
                      <span className="tp-admin-user-row__plan">
                        <span className={`tp-settings-badge ${plan !== "free" ? "tp-settings-badge--mint" : ""}`}>
                          {planName(t, plan)}
                        </span>
                        {u.planOverride ? <span className="tp-admin-user-row__note">★</span> : null}
                      </span>
                      <span className="tp-admin-user-row__activity">
                        {t("admin.users.formsSessions", { forms: u.formsCount, sessions: u.sessionsCount })}
                        <br />
                        {u.lastSessionAt
                          ? t("admin.users.lastSession", { date: fmtDate(u.lastSessionAt, locale) })
                          : t("admin.users.neverRan")}
                      </span>
                    </button>
                  );
                })}
                {!usersLoading && users.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--tp-text-muted)]">{t("admin.users.empty")}</p>
                ) : null}
              </div>
              {users.length < total ? (
                <div className="mt-3">
                  <button type="button" className={ui.btnSecondary} onClick={() => void loadUsers(query.trim(), users.length)}>
                    {t("admin.users.more")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

type PanelProps = {
  userId: string;
  isSelf: boolean;
  onBack: () => void;
  onChanged: (patch: Partial<AdminUserRow>) => void;
  onError: (message: string) => void;
};

function AdminUserPanel({ userId, isSelf, onBack, onChanged, onError }: PanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestJson<AdminUserDetail>(`/api/admin/users/${userId}`)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
        }
      })
      .catch((e) => onError(e instanceof Error ? e.message : t("admin.user.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [userId, onError, t]);

  const patch = async (body: { planOverride?: PlanId | null; isAdmin?: boolean }) => {
    if (!detail) {
      return;
    }
    setBusy(true);
    setSaved(false);
    try {
      await requestJson<{ ok: true }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setDetail({ ...detail, profile: { ...detail.profile, ...body } });
      onChanged(body);
      setSaved(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("admin.user.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const p = detail?.profile;
  return (
    <div data-testid="admin-user-panel">
      <button type="button" className={`${ui.btnGhost} -ml-2`} onClick={onBack}>
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("admin.user.back")}
      </button>

      {p ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <TeacherAvatar size="lg" name={p.displayName} email={p.email} avatarUrl={p.avatarUrl} />
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
                {p.displayName || p.email}
                {p.isAdmin ? <span className="tp-settings-badge tp-settings-badge--brand">{t("admin.users.adminBadge")}</span> : null}
              </h2>
              <p className="text-sm text-[var(--tp-text-secondary)]">{p.email}</p>
              <p className="text-xs text-[var(--tp-text-muted)]">
                {t("admin.users.joined", { date: fmtDate(p.createdAt, locale) })}
                {p.lastSignInAt ? ` · ${t("admin.users.lastSignIn", { date: fmtDate(p.lastSignInAt, locale) })}` : ""}
              </p>
            </div>
          </div>

          <div className="tp-settings-rules mt-4">
            <div className="tp-settings-row">
              <div>
                <p className="tp-settings-row__label">
                  <label htmlFor="admin-plan-override">{t("admin.user.planOverride")}</label>
                </p>
                <p className="tp-settings-row__hint">{t("admin.user.planOverrideHint")}</p>
              </div>
              <select
                id="admin-plan-override"
                className={`${ui.select} w-auto`}
                value={p.planOverride ?? ""}
                disabled={busy}
                onChange={(e) => void patch({ planOverride: e.target.value ? (e.target.value as PlanId) : null })}
                data-testid="admin-plan-override"
              >
                <option value="">{t("admin.user.planOverrideNone")}</option>
                {PLAN_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {planName(t, id)}
                  </option>
                ))}
              </select>
            </div>
            <SettingsSwitch
              id="admin-is-admin"
              label={t("admin.user.adminAccess")}
              hint={isSelf ? t("admin.user.adminSelf") : t("admin.user.adminAccessHint")}
              checked={p.isAdmin}
              dimmed={isSelf || busy}
              onChange={(next) => void patch({ isAdmin: next })}
            />
          </div>
          {saved ? (
            <p className="tp-settings-saved mt-2" role="status">
              {t("admin.user.saved")}
            </p>
          ) : null}

          <div className="tp-admin-detail mt-5">
            <section>
              <p className={ui.sectionTitle}>{t("admin.user.stripe")}</p>
              {detail?.billing ? (
                <div className="tp-soft-panel mt-2 text-sm">
                  <p className="font-medium">
                    {t("admin.user.stripeStatus", {
                      plan: planName(t, isPlanId(detail.billing.plan) ? detail.billing.plan : "free"),
                      status: detail.billing.status,
                    })}
                  </p>
                  {detail.billing.currentPeriodEnd ? (
                    <p className="text-[var(--tp-text-secondary)]">
                      {detail.billing.cancelAtPeriodEnd
                        ? t("admin.user.endsOn", { date: fmtDate(detail.billing.currentPeriodEnd, locale) })
                        : t("admin.user.renews", { date: fmtDate(detail.billing.currentPeriodEnd, locale) })}
                    </p>
                  ) : null}
                  {detail.billing.stripeCustomerId ? (
                    <p className="font-mono text-xs text-[var(--tp-text-muted)]">
                      {t("admin.user.customer", { id: detail.billing.stripeCustomerId })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--tp-text-muted)]">{t("admin.user.stripeNone")}</p>
              )}
            </section>

            <section>
              <p className={ui.sectionTitle}>{t("admin.user.forms")}</p>
              {detail && detail.forms.length > 0 ? (
                <ul className="tp-admin-list mt-2">
                  {detail.forms.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium">{f.title}</span>
                      <span className="tp-admin-list__meta">
                        {t("admin.user.formMeta", { questions: f.questionCount, sessions: f.sessionsCount, date: fmtDate(f.createdAt, locale) })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--tp-text-muted)]">{t("admin.user.formsEmpty")}</p>
              )}
            </section>

            <section>
              <p className={ui.sectionTitle}>{t("admin.user.sessions")}</p>
              {detail && detail.sessions.length > 0 ? (
                <ul className="tp-admin-list mt-2">
                  {detail.sessions.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">
                        {s.formTitle ?? "—"} <span className="font-mono text-xs text-[var(--tp-text-muted)]">{s.joinCode}</span>
                      </span>
                      <span className="tp-admin-list__meta">
                        {t("admin.user.sessionMeta", { participants: s.participants, submitted: s.submitted, date: fmtDate(s.createdAt, locale) })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--tp-text-muted)]">{t("admin.user.sessionsEmpty")}</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
