import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import Home from "../pages/Home";
import Workout from "../pages/Workout";
import CoachWeekPlanner from "./CoachWeekPlanner";
import { APP_VERSION } from "../version";

type BackendState = "checking" | "connected" | "error";

type SessionRow = {
  id: string;
  status: "planned" | "in_progress" | "completed" | "skipped";
  scheduled_date: string;
};

type FeedbackRow = {
  session_id: string;
  effort: number;
  enjoyment: number;
  post_feeling: "great" | "okay" | "tired" | "very_tired";
  discomfort: "none" | "minor" | "yes";
  actual_minutes: number | null;
  distance_value: number | null;
  distance_unit: "m" | "km" | null;
  notes: string | null;
  submitted_at: string;
  sessions: {
    title: string;
    scheduled_date: string;
    session_type: "cardio" | "swim" | "mixed" | "strength";
    estimated_minutes: number;
  } | null;
};

function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
}

function sundayOfCurrentWeek() {
  const monday = new Date(mondayOfCurrentWeek() + "T12:00:00");
  monday.setDate(monday.getDate() + 6);
  return monday.toISOString().slice(0, 10);
}

export default function CoachDashboard({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewWorkout, setPreviewWorkout] = useState(false);
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [backendMessage, setBackendMessage] = useState("Checking Chantastic backend…");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      const [{ data: statusData, error: statusError }, { data: sessionData }, { data: feedbackData }] =
        await Promise.all([
          supabase.from("app_status").select("app_name,status").eq("id", 1).single(),
          supabase
            .from("sessions")
            .select("id,status,scheduled_date")
            .gte("scheduled_date", mondayOfCurrentWeek())
            .lte("scheduled_date", sundayOfCurrentWeek()),
          supabase
            .from("session_feedback")
            .select("session_id,effort,enjoyment,post_feeling,discomfort,actual_minutes,distance_value,distance_unit,notes,submitted_at,sessions(title,scheduled_date,session_type,estimated_minutes)")
            .order("submitted_at", { ascending: false })
            .limit(10),
        ]);

      if (!mounted) return;

      if (statusError || statusData?.status !== "connected") {
        setBackendState("error");
        setBackendMessage("Backend connection failed");
      } else {
        setBackendState("connected");
        setBackendMessage(statusData.app_name + " backend connected");
      }

      setSessions((sessionData as SessionRow[]) ?? []);
      setFeedback(((feedbackData ?? []) as unknown) as FeedbackRow[]);
    };

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const completedCount = useMemo(
    () => sessions.filter((session) => session.status === "completed").length,
    [sessions],
  );

  const feedbackFlags = useMemo(
    () => feedback.filter((item) => item.discomfort !== "none").length,
    [feedback],
  );

  return (
    <main className="page coach-page">
      <section className="section-header">
        <span className="eyebrow">PRIVATE COACH VIEW</span>
        <h1>Chantastic Coach</h1>
        <p className="muted">
          Weekly programme monitoring, session feedback and plan editing will live here.
        </p>
      </section>

      <section className="backend-card" aria-live="polite">
        <span
          className={"backend-dot backend-dot--" + backendState}
          aria-hidden="true"
        />
        <div>
          <span className="backend-label">BACKEND</span>
          <strong>{backendMessage}</strong>
        </div>
      </section>

      <section className="coach-grid">
        <article className="metric-card">
          <span>Sessions this week</span>
          <strong>{completedCount} / {sessions.length}</strong>
        </article>
        <article className="metric-card">
          <span>Feedback flags</span>
          <strong>{feedbackFlags}</strong>
        </article>
      </section>

      <section className="coach-feedback-panel">
        <div className="coach-feedback-heading">
          <div>
            <span className="eyebrow">RECENT FEEDBACK</span>
            <h2>How sessions are landing</h2>
          </div>
          <span className="status-pill">{feedback.length} recent</span>
        </div>

        {feedback.length === 0 ? (
          <div className="coach-feedback-empty">
            No completed session feedback yet.
          </div>
        ) : (
          <div className="coach-feedback-list">
            {feedback.map((item) => (
              <article
                className={
                  "coach-feedback-card " +
                  (item.discomfort !== "none" ? "coach-feedback-card--flagged" : "")
                }
                key={item.session_id}
              >
                <div className="coach-feedback-topline">
                  <div>
                    <span className="coach-feedback-date">
                      {item.sessions?.scheduled_date
                        ? new Intl.DateTimeFormat("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          }).format(new Date(item.sessions.scheduled_date + "T12:00:00"))
                        : "Session"}
                    </span>
                    <h3>{item.sessions?.title ?? "Completed session"}</h3>
                  </div>
                  <span
                    className={
                      "feedback-flag " +
                      (item.discomfort === "none" ? "feedback-flag--clear" : "feedback-flag--alert")
                    }
                  >
                    {item.discomfort === "none"
                      ? "No discomfort"
                      : item.discomfort === "minor"
                        ? "Minor discomfort"
                        : "Discomfort"}
                  </span>
                </div>

                <div className="coach-feedback-metrics">
                  {item.actual_minutes ? (
                    <span>Time <strong>{item.actual_minutes} min</strong></span>
                  ) : null}
                  {item.distance_value && item.distance_unit ? (
                    <span>Distance <strong>{item.distance_value} {item.distance_unit}</strong></span>
                  ) : null}
                  <span>Effort <strong>{item.effort}/5</strong></span>
                  <span>Enjoyment <strong>{item.enjoyment}/5</strong></span>
                  <span>
                    Feeling{" "}
                    <strong>
                      {item.post_feeling === "very_tired"
                        ? "Very tired"
                        : item.post_feeling.charAt(0).toUpperCase() + item.post_feeling.slice(1)}
                    </strong>
                  </span>
                </div>

                {item.notes ? <p className="coach-feedback-note">“{item.notes}”</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <button
        className="preview-button"
        type="button"
        onClick={() => {
          setShowPreview((current) => !current);
          setPreviewWorkout(false);
        }}
      >
        {showPreview ? "Close Chantal Preview" : "Preview Chantal App"}
      </button>

      {showPreview ? (
        <div className="coach-preview-frame">
          <div className="coach-preview-bar">PREVIEW — not saved to Supabase</div>
          {previewWorkout ? (
            <Workout
              previewSession={{
                id: "preview",
                title: "Easy Swim",
                session_type: "swim",
                estimated_minutes: 50,
                status: "planned",
              }}
              previewBlocks={[
                {
                  id: "preview-warmup",
                  block_type: "warmup",
                  title: "Easy warm-up",
                  duration_minutes: 5,
                  instructions: "Relaxed swimming, any comfortable stroke.",
                  target_effort_min: 2,
                  target_effort_max: 4,
                  sort_order: 0,
                },
                {
                  id: "preview-main",
                  block_type: "swim",
                  title: "Steady swim",
                  duration_minutes: 35,
                  instructions: "Comfortable continuous swimming. Rest whenever needed.",
                  target_effort_min: 4,
                  target_effort_max: 6,
                  sort_order: 1,
                },
                {
                  id: "preview-cooldown",
                  block_type: "cooldown",
                  title: "Cool-down",
                  duration_minutes: 5,
                  instructions: "Very easy swimming.",
                  target_effort_min: 1,
                  target_effort_max: 3,
                  sort_order: 2,
                },
              ]}
              onPreviewDone={() => setPreviewWorkout(false)}
            />
          ) : (
            <Home
              displayName="Chantal"
              previewSession={{
                id: "preview",
                scheduled_date: new Date().toISOString().slice(0, 10),
                session_type: "swim",
                title: "Easy Swim",
                estimated_minutes: 50,
                optional: false,
                status: "planned",
              }}
              onStartPreview={() => setPreviewWorkout(true)}
            />
          )}
        </div>
      ) : null}

      <CoachWeekPlanner />

      <button className="secondary-button" type="button" onClick={() => void onSignOut()}>
        Sign out
      </button>

      <p className="version">Chantastic V{APP_VERSION}</p>
    </main>
  );
}
