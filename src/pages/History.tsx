import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

type HistorySession = {
  id: string;
  scheduled_date: string;
  session_type: "cardio" | "swim" | "mixed" | "strength";
  title: string;
  estimated_minutes: number;
  completed_at: string | null;
};

type Feedback = {
  session_id: string;
  effort: number;
  enjoyment: number;
  post_feeling: "great" | "okay" | "tired" | "very_tired";
  discomfort: "none" | "minor" | "yes";
  actual_minutes: number | null;
  distance_value: number | null;
  distance_unit: "m" | "km" | null;
  notes: string | null;
};

const icons: Record<HistorySession["session_type"], string> = {
  cardio: "🚴",
  swim: "🏊",
  mixed: "✨",
  strength: "🏋️",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00"));
}

export default function History() {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id,scheduled_date,session_type,title,estimated_minutes,completed_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("scheduled_date", { ascending: false })
        .limit(20);

      const rows = (sessionData as HistorySession[]) ?? [];
      setSessions(rows);

      if (rows.length > 0) {
        const { data: feedbackData } = await supabase
          .from("session_feedback")
          .select("session_id,effort,enjoyment,post_feeling,discomfort,actual_minutes,distance_value,distance_unit,notes")
          .in("session_id", rows.map((session) => session.id));

        setFeedback((feedbackData as Feedback[]) ?? []);
      }

      setLoading(false);
    };

    void loadHistory();
  }, []);

  const feedbackBySession = useMemo(
    () => new Map(feedback.map((item) => [item.session_id, item])),
    [feedback],
  );

  const averageEffort = useMemo(() => {
    if (!feedback.length) return null;
    return (feedback.reduce((sum, item) => sum + item.effort, 0) / feedback.length).toFixed(1);
  }, [feedback]);

  return (
    <main className="page">
      <section className="section-header">
        <span className="eyebrow">PROGRESS</span>
        <h1>History</h1>
        <p className="muted">
          {sessions.length
            ? sessions.length + " completed session" + (sessions.length === 1 ? "" : "s")
            : "Completed sessions will appear here."}
        </p>
      </section>

      {averageEffort ? (
        <section className="history-summary">
          <div>
            <span>Completed</span>
            <strong>{sessions.length}</strong>
          </div>
          <div>
            <span>Average effort</span>
            <strong>{averageEffort}/10</strong>
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">✨</span>
          <h2>Loading your history…</h2>
        </section>
      ) : sessions.length === 0 ? (
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">✨</span>
          <h2>Your first session starts the story</h2>
          <p>Nothing to track yet — exactly as it should be.</p>
        </section>
      ) : (
        <div className="history-list">
          {sessions.map((session) => {
            const sessionFeedback = feedbackBySession.get(session.id);

            return (
              <article className="history-card" key={session.id}>
                <div className="history-card-heading">
                  <span className="history-icon" aria-hidden="true">
                    {icons[session.session_type]}
                  </span>
                  <div>
                    <span className="history-date">{formatDate(session.scheduled_date)}</span>
                    <h2>{session.title}</h2>
                    <p>{session.estimated_minutes} min · {session.session_type}</p>
                  </div>
                </div>

                {sessionFeedback ? (
                  <div className="history-feedback-row">
                    {sessionFeedback.actual_minutes ? (
                      <span>Time <strong>{sessionFeedback.actual_minutes} min</strong></span>
                    ) : null}
                    {sessionFeedback.distance_value && sessionFeedback.distance_unit ? (
                      <span>
                        Distance <strong>{sessionFeedback.distance_value} {sessionFeedback.distance_unit}</strong>
                      </span>
                    ) : null}
                    <span>Effort <strong>{sessionFeedback.effort}/10</strong></span>
                    <span>Enjoyment <strong>{sessionFeedback.enjoyment}/10</strong></span>
                    <span>
                      {sessionFeedback.discomfort === "none"
                        ? "No discomfort"
                        : sessionFeedback.discomfort === "minor"
                          ? "Minor discomfort"
                          : "Discomfort flagged"}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
