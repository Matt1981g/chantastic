import { useEffect, useState } from "react";
import CoachDashboard from "./coach/CoachDashboard";
import History from "./pages/History";
import Home from "./pages/Home";
import Week from "./pages/Week";
import Workout from "./pages/Workout";
import "./App.css";

type RouteName = "today" | "week" | "history" | "workout" | "coach";

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

export default function App() {
  const [route, setRoute] = useState<RouteName>(getRoute);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  if (route === "coach") {
    return (
      <div className="app-shell">
        <CoachDashboard />
      </div>
    );
  }

  const page = {
    today: <Home />,
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
