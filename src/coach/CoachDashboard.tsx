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
