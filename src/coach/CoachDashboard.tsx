import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import Home from "../pages/Home";
import CoachWeekPlanner from "./CoachWeekPlanner";
import { APP_VERSION } from "../version";

type BackendState = "checking" | "connected" | "error";

type SessionRow = {
  id: string;
  status: "planned" | "in_progress" | "completed" | "skipped";
  scheduled_date: string;
};

type FeedbackRow = {
  discomfort: "none" | "minor" | "yes";
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
          supabase.from("session_feedback").select("discomfort"),
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
      setFeedback((feedbackData as FeedbackRow[]) ?? []);
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

      <button
        className="preview-button"
        type="button"
        onClick={() => setShowPreview((current) => !current)}
      >
        {showPreview ? "Close Chantal Preview" : "Preview Chantal App"}
      </button>

      {showPreview ? (
        <div className="coach-preview-frame">
          <div className="coach-preview-bar">PREVIEW — not saved to Supabase</div>
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
          />
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
