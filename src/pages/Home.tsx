import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { APP_VERSION } from "../version";

type Session = {
  id: string;
  scheduled_date: string;
  session_type: "cardio" | "swim" | "mixed" | "strength";
  title: string;
  estimated_minutes: number;
  optional: boolean;
  status: "planned" | "in_progress" | "completed" | "skipped";
};

const sessionIcons: Record<Session["session_type"], string> = {
  cardio: "🚴",
  swim: "🏊",
  mixed: "✨",
  strength: "🏋️",
};

function localDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function Home({
  displayName,
  previewSession,
}: {
  displayName: string;
  previewSession?: Session | null;
}) {
  const [session, setSession] = useState<Session | null>(previewSession ?? null);
  const [loading, setLoading] = useState(!previewSession);

  useEffect(() => {
    if (previewSession) {
      setSession(previewSession);
      setLoading(false);
      return;
    }

    const loadToday = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("sessions")
        .select("id,scheduled_date,session_type,title,estimated_minutes,optional,status,weekly_plans!inner(status)")
        .eq("user_id", user.id)
        .eq("scheduled_date", localDateString())
        .eq("weekly_plans.status", "published")
        .order("sort_order")
        .limit(1)
        .maybeSingle();

      setSession((data as unknown as Session | null) ?? null);
      setLoading(false);
    };

    void loadToday();
  }, [previewSession]);

  return (
    <main className="page">
      <section className="brand-block" aria-labelledby="chantastic-title">
        <p className="brand-kicker">YOUR FITNESS, YOUR PACE</p>
        <h1 id="chantastic-title">CHANTASTIC</h1>
        <p className="tagline">Just show up.</p>
      </section>

      <section className="welcome-card">
        <p className="hello">👋 Hi {displayName}</p>
        <p className="welcome-copy">
          No pressure. No complicated stats. Just a clear plan for today.
        </p>
      </section>

      {loading ? (
        <section className="today-card">
          <span className="eyebrow">TODAY</span>
          <h2>Loading today’s plan…</h2>
        </section>
      ) : session ? (
        <section className="today-card today-card--ready">
          <div className="card-heading">
            <div>
              <span className="eyebrow">TODAY</span>
              <h2>{session.title}</h2>
            </div>
            <span className="status-pill status-pill--ready">
              {session.optional ? "Optional" : "Planned"}
            </span>
          </div>

          <div className="session-preview">
            <span className="session-icon" aria-hidden="true">
              {sessionIcons[session.session_type]}
            </span>
            <div>
              <strong>{session.estimated_minutes} minutes</strong>
              <span>{session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)}</span>
            </div>
          </div>

          <a className="start-session-button" href="#/workout">
            Start session
          </a>
        </section>
      ) : (
        <section className="today-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">TODAY</span>
              <h2>Nothing planned today</h2>
            </div>
            <span className="status-pill">Easy day</span>
          </div>

          <p className="muted">
            Enjoy the day. Your next planned session will appear here automatically.
          </p>
        </section>
      )}

      <p className="version">Chantastic V{APP_VERSION}</p>
    </main>
  );
}
