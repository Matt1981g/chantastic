import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../services/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setStatus("sending");
    setMessage("");

    if (isStandalone) {
      if (!password) {
        setStatus("error");
        setMessage("Enter the Chantastic password you set in Safari.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setStatus("error");
        setMessage("That email or password didn’t work. Open Chantastic in Safari and use “Set up the Home Screen app” once.");
        return;
      }

      setStatus("sent");
      setMessage("Signed in. Opening Chantastic…");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for your Chantastic sign-in link.");
  };

  return (
    <main className="page auth-page">
      <section className="brand-block" aria-labelledby="login-title">
        <img className="brand-logo" src="/chantastic-icon.svg" alt="" aria-hidden="true" />
        <p className="brand-kicker">YOUR FITNESS, YOUR PACE</p>
        <h1 id="login-title">CHANTASTIC</h1>
        <p className="tagline">Just show up.</p>
      </section>

      <section className="auth-card">
        <span className="auth-icon" aria-hidden="true">{isStandalone ? "📱" : "✨"}</span>
        <h2>{isStandalone ? "Welcome back" : "Welcome"}</h2>
        <p className="muted">
          {isStandalone
            ? "Sign in once here and Chantastic will keep you signed in on your Home Screen."
            : "Enter your email and we’ll send you a secure sign-in link."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email}
            onChange={(event) => setEmail(event.target.value)} disabled={status === "sending"} required />
          {isStandalone ? (
            <>
              <label htmlFor="password">Chantastic password</label>
              <input id="password" type="password" autoComplete="current-password" placeholder="Your Chantastic password"
                value={password} onChange={(event) => setPassword(event.target.value)} disabled={status === "sending"} required />
            </>
          ) : null}
          <button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Signing in…" : isStandalone ? "Open Chantastic" : "Send sign-in link"}
          </button>
        </form>

        {message ? (
          <p className={status === "error" ? "auth-message auth-message--error" : "auth-message"}>{message}</p>
        ) : null}
      </section>
    </main>
  );
}
