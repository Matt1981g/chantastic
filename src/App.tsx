import { useCallback, useEffect, useState } from "react";
import CoachDashboard from "./coach/CoachDashboard";
import History from "./pages/History";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Week from "./pages/Week";
import Workout from "./pages/Workout";
import { supabase } from "./services/supabase";
import "./App.css";

type RouteName = "today" | "week" | "history" | "workout" | "coach";
type AuthState = "loading" | "signedOut" | "signedIn" | "denied";

type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: "coach" | "user";
};

function getRoute(): RouteName {
  if (window.location.pathname === "/coach") {
    return "coach";
  }

  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];

  switch (hash) {
    case "week":
      return "week";
    case "history":
      return "history";
    case "workout":
      return "workout";
    case "coach":
      return "coach";
    default:
      return "today";
  }
}

function BottomNav({ route }: { route: RouteName }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <a className={route === "today" ? "active" : ""} href="#/">
        <span aria-hidden="true">☀️</span>
        <span>Today</span>
      </a>
      <a className={route === "week" ? "active" : ""} href="#/week">
        <span aria-hidden="true">📅</span>
        <span>Week</span>
      </a>
      <a className={route === "history" ? "active" : ""} href="#/history">
        <span aria-hidden="true">✨</span>
        <span>History</span>
      </a>
    </nav>
  );
}

function LoadingScreen() {
  return (
    <main className="page auth-page">
      <section className="auth-card auth-card--compact">
        <span className="auth-icon" aria-hidden="true">✨</span>
        <h2>Opening Chantastic…</h2>
      </section>
    </main>
  );
}

function AccessDenied({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="page auth-page">
      <section className="auth-card">
        <span className="auth-icon" aria-hidden="true">🔒</span>
        <h2>Access not enabled</h2>
        <p className="muted">
          This account isn’t approved for Chantastic.
        </p>
        <button className="secondary-button" type="button" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState<RouteName>(getRoute);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadIdentity = useCallback(async () => {
    const {
      data: { claims },
      error: claimsError,
    } = await supabase.auth.getClaims();

    if (claimsError || !claims?.sub) {
      setProfile(null);
      setAuthState("signedOut");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name,role")
      .eq("id", claims.sub)
      .single();

    if (error || !data) {
      setProfile(null);
      setAuthState("denied");
      return;
    }

    setProfile(data as Profile);
    setAuthState("signedIn");

    if (data.role === "coach" && getRoute() === "today") {
      window.location.hash = "/coach";
    }
  }, []);

  useEffect(() => {
    void loadIdentity();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadIdentity();
    });

    return () => subscription.unsubscribe();
  }, [loadIdentity]);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.hash = "/";
    setProfile(null);
    setAuthState("signedOut");
  };

  if (authState === "loading") {
    return (
      <div className="app-shell">
        <LoadingScreen />
      </div>
    );
  }

  if (authState === "signedOut") {
    return (
      <div className="app-shell">
        <Login />
      </div>
    );
  }

  if (authState === "denied" || !profile) {
    return (
      <div className="app-shell">
        <AccessDenied onSignOut={signOut} />
      </div>
    );
  }

  if (route === "coach") {
    if (profile.role !== "coach") {
      return (
        <div className="app-shell">
          <AccessDenied onSignOut={signOut} />
        </div>
      );
    }

    return (
      <div className="app-shell">
        <CoachDashboard onSignOut={signOut} />
      </div>
    );
  }

  const page = {
    today: <Home displayName={profile.display_name} />,
    week: <Week />,
    history: <History />,
    workout: <Workout />,
    coach: null,
  }[route];

  return (
    <div className="app-shell">
      {page}
      <BottomNav route={route} />
    </div>
  );
}
