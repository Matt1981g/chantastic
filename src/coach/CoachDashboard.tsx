import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { APP_VERSION } from "../version";

type BackendState = "checking" | "connected" | "error";

export default function CoachDashboard() {
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [backendMessage, setBackendMessage] = useState("Checking Chantastic backend…");

  useEffect(() => {
    let mounted = true;

    const checkBackend = async () => {
      const { data, error } = await supabase
        .from("app_status")
        .select("app_name,status")
        .eq("id", 1)
        .single();

      if (!mounted) return;

      if (error || data?.status !== "connected") {
        setBackendState("error");
        setBackendMessage("Backend connection failed");
        return;
      }

      setBackendState("connected");
      setBackendMessage(data.app_name + " backend connected");
    };

    void checkBackend();

    return () => {
      mounted = false;
    };
  }, []);

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
          <strong>0 / 0</strong>
        </article>
        <article className="metric-card">
          <span>Feedback flags</span>
          <strong>0</strong>
        </article>
      </section>

      <section className="empty-card">
        <span className="empty-icon" aria-hidden="true">🛠️</span>
        <h2>Coach dashboard ready</h2>
        <p>Authentication and programme controls come next.</p>
      </section>

      <p className="version">Chantastic V{APP_VERSION}</p>
    </main>
  );
}
