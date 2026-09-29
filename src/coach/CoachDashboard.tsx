import { APP_VERSION } from "../version";

export default function CoachDashboard() {
  return (
    <main className="page coach-page">
      <section className="section-header">
        <span className="eyebrow">PRIVATE COACH VIEW</span>
        <h1>Chantastic Coach</h1>
        <p className="muted">
          Weekly programme monitoring, session feedback and plan editing will live here.
        </p>
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
