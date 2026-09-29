export default function Week() {
  return (
    <main className="page">
      <section className="section-header">
        <span className="eyebrow">YOUR PLAN</span>
        <h1>This Week</h1>
        <p className="muted">Your weekly programme will appear here.</p>
      </section>

      <section className="empty-card">
        <span className="empty-icon" aria-hidden="true">📅</span>
        <h2>No programme yet</h2>
        <p>We’ll build the first week around 3–5 sessions of cardio and swimming.</p>
      </section>
    </main>
  );
}
