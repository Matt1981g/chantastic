import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

type WeekSession = {
  id: string;
  weekly_plan_id: string;
  equipment_key?: string | null;
  scheduled_date: string;
  session_type: "cardio" | "swim" | "mixed" | "strength";
  title: string;
  estimated_minutes: number;
  optional: boolean;
  status: "planned" | "in_progress" | "completed" | "skipped";
};

type WeekPlan = {
  id: string;
  week_start: string;
  coach_summary: string | null;
  target_sessions: number;
};

type WeekBundle = {
  plan: WeekPlan;
  sessions: WeekSession[];
};

type PreviewBlock = {
  session_id: string;
  block_type: string;
  title: string;
  duration_minutes: number | null;
  instructions: string | null;
  target_effort_min: number | null;
  target_effort_max: number | null;
  target_metric: {
    resistance_level?: number | null;
    incline_percent?: number | null;
    target_speed_kmh?: number | null;
    target_distance?: number | null;
    distance_unit?: "m" | "km" | null;
  } | null;
  equipment_key: string | null;
  sort_order: number;
};

function sessionIcon(session: WeekSession) {
  const key = session.equipment_key ?? "";
  if (key === "treadmill") return "🚶";
  if (key === "rower") return "🚣";
  if (key === "bike") return "🚴";
  if (key === "cross_trainer") return "🏃";
  if (key === "concept2_skierg") return "⛷️";
  if (key === "stepper") return "🪜";
  if (session.session_type === "swim") return "🏊";
  if (session.session_type === "strength") return "🏋️";
  return "✨";
}

function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00");
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00"));
}

function formatWeekStart(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00"));
}

export default function Week() {
  const [weeks, setWeeks] = useState<WeekBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [blocksBySession, setBlocksBySession] = useState<Map<string, PreviewBlock[]>>(new Map());

  useEffect(() => {
    let mounted = true;
    let refreshTimer: number | null = null;

    const loadWeeks = async (showLoader = false) => {
      if (showLoader && mounted) {
        setLoading(true);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) {
          setWeeks([]);
          setBlocksBySession(new Map());
          setLoading(false);
        }
        return;
      }

      const currentWeekStart = mondayOfCurrentWeek();
      const nextWeekStart = addDays(currentWeekStart, 7);

      const { data: planData, error: planError } = await supabase
        .from("weekly_plans")
        .select("id,week_start,coach_summary,target_sessions")
        .eq("user_id", user.id)
        .eq("status", "published")
        .in("week_start", [currentWeekStart, nextWeekStart])
        .order("week_start");

      if (!mounted) return;

      if (planError || !planData?.length) {
        setWeeks([]);
        setBlocksBySession(new Map());
        setLoading(false);
        return;
      }

      const cleanPlans = planData as WeekPlan[];
      const planIds = cleanPlans.map((item) => item.id);

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id,weekly_plan_id,scheduled_date,session_type,title,estimated_minutes,optional,status")
        .in("weekly_plan_id", planIds)
        .order("scheduled_date")
        .order("sort_order");

      if (!mounted) return;

      const cleanSessions = (sessionData as WeekSession[]) ?? [];
      const groupedBlocks = new Map<string, PreviewBlock[]>();

      if (cleanSessions.length) {
        const { data: blockData } = await supabase
          .from("session_blocks")
          .select("session_id,equipment_key,block_type,title,duration_minutes,instructions,target_effort_min,target_effort_max,target_metric,sort_order")
          .in("session_id", cleanSessions.map((item) => item.id))
          .order("sort_order");

        if (!mounted) return;

        const cleanBlocks = (blockData ?? []) as PreviewBlock[];
        const firstEquipment = new Map<string, string>();

        for (const block of cleanBlocks) {
          if (!firstEquipment.has(block.session_id) && block.equipment_key) {
            firstEquipment.set(block.session_id, block.equipment_key);
          }

          groupedBlocks.set(
            block.session_id,
            [...(groupedBlocks.get(block.session_id) ?? []), block],
          );
        }

        cleanSessions.forEach((item) => {
          item.equipment_key = firstEquipment.get(item.id) ?? null;
        });
      }

      const loadedWeeks = cleanPlans.map((plan) => ({
        plan,
        sessions: cleanSessions.filter((session) => session.weekly_plan_id === plan.id),
      }));

      setWeeks(loadedWeeks);
      setBlocksBySession(groupedBlocks);
      setLoading(false);
    };

    const scheduleRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        void loadWeeks(false);
      }, 200);
    };

    void loadWeeks(true);

    const channel = supabase
      .channel("chantastic-athlete-plan")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_plans" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_blocks" },
        scheduleRefresh,
      )
      .subscribe();

    const handleFocus = () => scheduleRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }

      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, []);

  const currentWeekStart = mondayOfCurrentWeek();
  const currentWeek = useMemo(
    () => weeks.find((item) => item.plan.week_start === currentWeekStart) ?? null,
    [currentWeekStart, weeks],
  );
  const nextWeek = useMemo(
    () => weeks.find((item) => item.plan.week_start === addDays(currentWeekStart, 7)) ?? null,
    [currentWeekStart, weeks],
  );

  const completed = useMemo(
    () => currentWeek?.sessions.filter((session) => session.status === "completed").length ?? 0,
    [currentWeek],
  );

  const headerCopy = currentWeek
    ? completed + " of " + currentWeek.sessions.length + " sessions complete this week"
    : nextWeek
      ? "Next week is published and ready."
      : "Your plan, kept simple.";

  return (
    <main className="page">
      <section className="section-header">
        <span className="eyebrow">YOUR PLAN</span>
        <h1>Plan</h1>
        <p className="muted">{headerCopy}</p>
      </section>

      {loading ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">✨</span>
          <h2>Loading your plan…</h2>
        </section>
      ) : weeks.length === 0 ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">📅</span>
          <h2>No programme published yet</h2>
          <p>Your next plan will appear here as soon as your coach publishes it.</p>
        </section>
      ) : (
        <>
          {weeks.map(({ plan, sessions }) => {
            const isCurrentWeek = plan.week_start === currentWeekStart;
            const label = isCurrentWeek ? "THIS WEEK" : "NEXT WEEK";

            return (
              <section className="week-plan-group" key={plan.id}>
                <section className="week-summary-card">
                  <span className="eyebrow">{label}</span>
                  <p>
                    <strong>
                      {isCurrentWeek ? "Current plan" : "Next plan"} · starts {formatWeekStart(plan.week_start)}
                    </strong>
                  </p>
                  {plan.coach_summary ? <p>{plan.coach_summary}</p> : null}
                </section>

                <div className="week-session-list">
                  {sessions.map((session) => (
                    <article
                      className={
                        "week-session-card " +
                        (session.status === "completed" ? "week-session-card--complete" : "")
                      }
                      key={session.id}
                    >
                      <div className="week-session-icon" aria-hidden="true">
                        {sessionIcon(session)}
                      </div>
                      <div className="week-session-copy">
                        <span className="week-session-day">{formatDay(session.scheduled_date)}</span>
                        <h2>{session.title}</h2>
                        <div className="week-session-meta">
                          <span>{session.estimated_minutes} min</span>
                          <span>{session.session_type}</span>
                          {session.optional ? <span>optional</span> : null}
                        </div>
                      </div>
                      <div className="week-session-actions">
                        <button
                          type="button"
                          className="week-preview-button"
                          onClick={() => setPreviewId((current) => current === session.id ? null : session.id)}
                        >
                          {previewId === session.id ? "Hide preview" : "Preview"}
                        </button>
                        {session.status !== "completed" ? (
                          <a className="week-start-button" href={"#/workout?session=" + session.id}>Start session</a>
                        ) : null}
                        <span className={"week-status week-status--" + session.status}>
                          {session.status === "completed"
                            ? "Done"
                            : session.status === "in_progress"
                              ? "Started"
                              : session.status === "skipped"
                                ? "Skipped"
                                : "Planned"}
                        </span>
                      </div>

                      {previewId === session.id ? (
                        <div className="week-session-preview">
                          {(blocksBySession.get(session.id) ?? []).map((block, index) => (
                            <div className="week-preview-block" key={index}>
                              <div className="week-preview-topline">
                                <strong>{index + 1}. {block.title}</strong>
                                {block.duration_minutes ? <span>{block.duration_minutes} min</span> : null}
                              </div>
                              <div className="week-preview-meta">
                                {block.target_effort_min && block.target_effort_max ? (
                                  <span>Effort {block.target_effort_min}–{block.target_effort_max}/5</span>
                                ) : null}
                                {block.target_metric?.target_speed_kmh != null ? (
                                  <span>≈ {block.target_metric.target_speed_kmh} km/h</span>
                                ) : null}
                                {block.target_metric?.target_distance != null ? (
                                  <span>Target {block.target_metric.target_distance} {block.target_metric.distance_unit ?? "km"}</span>
                                ) : null}
                                {block.target_metric?.incline_percent != null ? (
                                  <span>Incline {block.target_metric.incline_percent}%</span>
                                ) : null}
                                {block.target_metric?.resistance_level != null ? (
                                  <span>Level {block.target_metric.resistance_level}</span>
                                ) : null}
                              </div>
                              {block.instructions ? <p>{block.instructions}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
