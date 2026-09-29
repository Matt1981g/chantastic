import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

type WeekSession = {
  id: string;
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

const icons: Record<WeekSession["session_type"], string> = {
  cardio: "🚴",
  swim: "🏊",
  mixed: "✨",
  strength: "🏋️",
};

function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00"));
}

export default function Week() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [sessions, setSessions] = useState<WeekSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWeek = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const weekStart = mondayOfCurrentWeek();

      const { data: planData } = await supabase
        .from("weekly_plans")
        .select("id,week_start,coach_summary,target_sessions")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .eq("status", "published")
        .maybeSingle();

      if (!planData) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id,scheduled_date,session_type,title,estimated_minutes,optional,status")
        .eq("weekly_plan_id", planData.id)
        .order("scheduled_date")
        .order("sort_order");

      setPlan(planData as WeekPlan);
      setSessions((sessionData as WeekSession[]) ?? []);
      setLoading(false);
    };

    void loadWeek();
  }, []);

  const completed = useMemo(
    () => sessions.filter((session) => session.status === "completed").length,
    [sessions],
  );

  return (
    <main className="page">
      <section className="section-header">
        <span className="eyebrow">YOUR PLAN</span>
        <h1>This Week</h1>
        <p className="muted">
          {plan ? completed + " of " + sessions.length + " sessions complete" : "Your week, kept simple."}
        </p>
      </section>

      {loading ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">✨</span>
          <h2>Loading your week…</h2>
        </section>
      ) : !plan ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">📅</span>
          <h2>No programme published yet</h2>
          <p>Your next week will appear here as soon as your coach publishes it.</p>
        </section>
      ) : (
        <>
          {plan.coach_summary ? (
            <section className="week-summary-card">
              <span className="eyebrow">THIS WEEK</span>
              <p>{plan.coach_summary}</p>
            </section>
          ) : null}

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
                  {icons[session.session_type]}
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
                <span className={"week-status week-status--" + session.status}>
                  {session.status === "completed"
                    ? "Done"
                    : session.status === "in_progress"
                      ? "Started"
                      : session.status === "skipped"
                        ? "Skipped"
                        : "Planned"}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
