import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../services/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [useMagicLink, setUseMagicLink] = useState(false);

  const handlePasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;

    setStatus("sending");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setStatus("error");
      setMessage("That email or password didn’t work.");
      return;
    }

    setStatus("sent");
    setMessage("Signed in. Opening Chantastic…");
  };

  const sendMagicLink = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setStatus("error");
      setMessage("Enter your email first.");
      return;
    }

    setStatus("sending");
    setMessage("");

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
        <span className="auth-icon" aria-hidden="true">📱</span>
        <h2>Welcome back</h2>
        <p className="muted">Sign in with your Chantastic email and password.</p>

        <form className="auth-form" onSubmit={handlePasswordSignIn}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === "sending"}
            required
          />

          {!useMagicLink ? (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your Chantastic password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={status === "sending"}
                required
              />
              <button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Signing in…" : "Sign in"}
              </button>
            </>
          ) : (
            <button type="button" disabled={status === "sending"} onClick={() => void sendMagicLink()}>
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          )}
        </form>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setUseMagicLink((current) => !current);
            setMessage("");
            setStatus("idle");
          }}
        >
          {useMagicLink ? "Use password instead" : "Use email magic link instead"}
        </button>

        {message ? (
          <p className={status === "error" ? "auth-message auth-message--error" : "auth-message"}>
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
