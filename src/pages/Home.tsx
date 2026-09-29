import { APP_VERSION } from "../version";

export default function Home({ displayName }: { displayName: string }) {
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

      <section className="today-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">TODAY</span>
            <h2>Nothing planned yet</h2>
          </div>
          <span className="status-pill">Setup</span>
        </div>

        <p className="muted">
          Your first cardio and swimming programme will appear here.
        </p>

        <div className="session-preview">
          <span className="session-icon" aria-hidden="true">🏊</span>
          <div>
            <strong>45–55 minute sessions</strong>
            <span>Simple guidance • 3–5 days per week</span>
          </div>
        </div>
      </section>

      <p className="version">Chantastic V{APP_VERSION}</p>
    </main>
  );
}
