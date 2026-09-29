import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

type Athlete = {
  id: string;
  display_name: string;
  email: string;
};

type SessionType = "cardio" | "swim" | "mixed" | "strength";
type PlanStatus = "draft" | "published";

type BlockDraft = {
  title: string;
  block_type: "warmup" | "cardio" | "swim" | "strength" | "intervals" | "cooldown" | "other";
  duration_minutes: number;
  instructions: string;
  target_effort_min: number;
  target_effort_max: number;
  equipment_key?: string | null;
  target_metric?: {
    resistance_level?: number | null;
    incline_percent?: number | null;
    target_speed_kmh?: number | null;
    target_distance?: number | null;
    distance_unit?: "m" | "km" | null;
  } | null;
};

type Equipment = {
  equipment_key: string;
  display_name: string;
  category: "cardio" | "strength" | "other";
  active: boolean;
};

type SessionDraft = {
  scheduled_date: string;
  session_type: SessionType;
  title: string;
  estimated_minutes: number;
  optional: boolean;
  blocks: BlockDraft[];
};

type CoachImport = {
  contract_version: "CHANTASTIC_COACH_BRIDGE_1.0";
  next_week: {
    week_start: string;
    target_sessions: number;
    coach_summary?: string;
    sessions: SessionDraft[];
  };
};

function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
}


export default function CoachWeekPlanner() {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [weekStart, setWeekStart] = useState(mondayOfCurrentWeek);
  const [targetSessions, setTargetSessions] = useState(3);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [coachSummary, setCoachSummary] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [bridgeMessage, setBridgeMessage] = useState("");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [hasImportedPlan, setHasImportedPlan] = useState(false);

  useEffect(() => {
    const loadPlannerData = async () => {
      const [{ data: athleteData }, { data: equipmentData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,display_name,email")
          .eq("role", "user")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("available_equipment")
          .select("equipment_key,display_name,category,active")
          .eq("active", true)
          .eq("programming_enabled", true)
          .order("display_name"),
      ]);

      setAthlete(athleteData ?? null);
      setEquipment((equipmentData as Equipment[]) ?? []);
    };

    void loadPlannerData();
  }, []);

  const totalMinutes = useMemo(
    () => sessions.reduce((sum, session) => sum + Number(session.estimated_minutes || 0), 0),
    [sessions],
  );








  const exportCoachBridge = async () => {
    if (!athlete) {
      setBridgeMessage("Chantal needs to sign in once before training history can be exported.");
      return;
    }

    setBridgeBusy(true);
    setBridgeMessage("");

    const since = new Date();
    since.setDate(since.getDate() - 21);
    const sinceDate = since.toISOString().slice(0, 10);

    const { data: plans, error: plansError } = await supabase
      .from("weekly_plans")
      .select("id,week_start,status,target_sessions,coach_summary,created_at,updated_at,published_at")
      .eq("user_id", athlete.id)
      .gte("week_start", sinceDate)
      .order("week_start");

    if (plansError) {
      setBridgeBusy(false);
      setBridgeMessage(plansError.message);
      return;
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from("sessions")
      .select("id,weekly_plan_id,scheduled_date,session_type,title,estimated_minutes,optional,status,coach_note,user_note,started_at,completed_at,sort_order")
      .eq("user_id", athlete.id)
      .gte("scheduled_date", sinceDate)
      .order("scheduled_date")
      .order("sort_order");

    if (sessionsError) {
      setBridgeBusy(false);
      setBridgeMessage(sessionsError.message);
      return;
    }

    const sessionIds = (sessionRows ?? []).map((session) => session.id);

    const [{ data: blockRows, error: blocksError }, { data: feedbackRows, error: feedbackError }] =
      sessionIds.length > 0
        ? await Promise.all([
            supabase
              .from("session_blocks")
              .select("id,session_id,block_type,title,duration_minutes,instructions,target_effort_min,target_effort_max,target_metric,equipment_key,sort_order")
              .in("session_id", sessionIds)
              .order("sort_order"),
            supabase
              .from("session_feedback")
              .select("session_id,effort,enjoyment,post_feeling,discomfort,actual_minutes,distance_value,distance_unit,cardio_equipment_key,resistance_level,incline_percent,notes,submitted_at")
              .in("session_id", sessionIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

    if (blocksError || feedbackError) {
      setBridgeBusy(false);
      setBridgeMessage(blocksError?.message ?? feedbackError?.message ?? "Could not export history.");
      return;
    }

    const { data: cardioPerformance } = await supabase
      .from("cardio_performance")
      .select("equipment_key,duration_minutes,distance_value,distance_unit,resistance_level,incline_percent,performed_at,source")
      .eq("user_id", athlete.id)
      .order("performed_at", { ascending: false });

    const exportPayload = {
      contract_version: "CHANTASTIC_COACH_BRIDGE_1.0",
      generated_at: new Date().toISOString(),
      athlete: {
        display_name: athlete.display_name,
      },
      available_equipment: equipment.map((item) => ({
        equipment_key: item.equipment_key,
        display_name: item.display_name,
        category: item.category,
      })),
      coaching_context: {
        primary_goal: "Build sustainable gym confidence and general fitness.",
        current_style: "Beginner-friendly two-part sessions. Allowed orders only: cardio → swim, strength → swim, cardio → strength, strength → cardio.",
        normal_session_minutes: "Maximum 50 minutes. Never exceed 50 minutes.",
        normal_weekly_frequency: "3-5",
        swim_ui_rule: "Swimming sessions must be programmed as a complete plan viewed before entering the pool. No staged phone interaction while swimming.",
        cardio_progression_rule:
          "For the same cardio machine, use the most recent valid baseline. Keep the recorded resistance/level or treadmill incline comparable, then target approximately 2.5% higher average speed/distance when feedback supports progression. If resistance/level is missing, establish it before treating the baseline as fully comparable.",
        programming_instruction:
          "Review recent adherence, cardio performance, machine settings and feedback. Produce the next week conservatively, progressing only when the completed sessions and feedback support it.",
      },
      recent_history_days: 21,
      weekly_plans: plans ?? [],
      sessions: sessionRows ?? [],
      session_blocks: blockRows ?? [],
      feedback: feedbackRows ?? [],
      cardio_performance: cardioPerformance ?? [],
      required_response: {
        contract_version: "CHANTASTIC_COACH_BRIDGE_1.0",
        next_week: {
          week_start: "YYYY-MM-DD",
          target_sessions: "3, 4 or 5",
          coach_summary: "short optional summary",
          sessions: [
            {
              scheduled_date: "YYYY-MM-DD",
              session_type: "cardio | swim | mixed | strength",
              title: "string",
              estimated_minutes: "number, maximum 50",
              optional: "boolean",
              blocks: [
                {
                  title: "string",
                  block_type: "warmup | cardio | swim | strength | intervals | cooldown | other",
                  duration_minutes: "number",
                  instructions: "string",
                  target_effort_min: "1-5",
                  target_effort_max: "1-5",
                  equipment_key: "Use only one of the available_equipment equipment_key values, or null when no machine applies",
                  target_metric: {
                    resistance_level: "number or null; use for cross trainer, bike, rower, SkiErg and stepper",
                    incline_percent: "number or null; use for treadmill",
                    target_speed_kmh: "number or null",
                    target_distance: "number or null",
                    distance_unit: "m | km | null",
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      new Date().toISOString().slice(0, 10).replaceAll("-", "") +
      "_CHANTASTIC_COACH_BRIDGE.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setBridgeBusy(false);
    setBridgeMessage("Coach Bridge export created. Upload that JSON to ChatGPT.");
  };

  const importCoachBridgeFile = async (file: File) => {
    setBridgeMessage("");

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as CoachImport;

      if (parsed.contract_version !== "CHANTASTIC_COACH_BRIDGE_1.0") {
        throw new Error("Wrong Coach Bridge contract version.");
      }

      if (!parsed.next_week || !Array.isArray(parsed.next_week.sessions)) {
        throw new Error("The JSON does not contain a valid next_week programme.");
      }

      const importedSessions = parsed.next_week.sessions;

      if (importedSessions.length < 1 || importedSessions.length > 7) {
        throw new Error("Imported programme must contain between 1 and 7 sessions.");
      }

      const allowedEquipment = new Set(equipment.map((item) => item.equipment_key));

      for (const session of importedSessions) {
        const blockMinutes = session.blocks?.reduce((sum, block) => sum + Number(block.duration_minutes || 0), 0) ?? 0;
        if (Number(session.estimated_minutes) > 50 || blockMinutes > 50) {
          throw new Error("Every session must be 50 minutes or less.");
        }

        const coreOrder = (session.blocks ?? [])
          .map((block) => block.block_type)
          .filter((type) => type === "cardio" || type === "swim" || type === "strength");
        const allowedOrders = ["cardio>swim", "strength>swim", "cardio>strength", "strength>cardio"];
        const orderKey = [...new Set(coreOrder)].join(">");
        if (orderKey && !allowedOrders.includes(orderKey)) {
          throw new Error("Session order must be cardio→swim, weights→swim, cardio→weights or weights→cardio.");
        }

        if (!["cardio", "swim", "mixed", "strength"].includes(session.session_type)) {
          throw new Error("Imported programme contains an unsupported session type.");
        }

        if (!Array.isArray(session.blocks)) {
          throw new Error("Every imported session must contain a blocks array.");
        }

        for (const block of session.blocks) {
          if (block.equipment_key && !allowedEquipment.has(block.equipment_key)) {
            throw new Error("Imported programme uses unavailable equipment: " + block.equipment_key);
          }
        }
      }

      setWeekStart(parsed.next_week.week_start);
      setTargetSessions(parsed.next_week.target_sessions);
      setCoachSummary(parsed.next_week.coach_summary ?? "");
      setSessions(importedSessions);
      setSaveState("idle");
      setMessage("");
      setHasImportedPlan(true);
      setBridgeMessage("ChatGPT plan imported. Review it below, then publish when ready.");
    } catch (error) {
      setBridgeMessage(error instanceof Error ? error.message : "Could not import Coach Bridge JSON.");
    }
  };

  const savePlan = async (status: PlanStatus) => {
    if (!athlete) {
      setSaveState("error");
      setMessage("Chantal needs to sign in once before a programme can be assigned.");
      return;
    }

    for (const session of sessions) {
      const blockMinutes = session.blocks.reduce((sum, block) => sum + Number(block.duration_minutes || 0), 0);
      if (Number(session.estimated_minutes) > 50 || blockMinutes > 50) {
        setSaveState("error");
        setMessage("Every session must be 50 minutes or less.");
        return;
      }
    }

    setSaveState("saving");
    setMessage("");

    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("weekly_plans")
      .select("id")
      .eq("user_id", athlete.id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existingPlanError) {
      setSaveState("error");
      setMessage(existingPlanError.message);
      return;
    }

    if (existingPlan?.id) {
      const { count, error: completionError } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("weekly_plan_id", existingPlan.id)
        .eq("status", "completed");

      if (completionError) {
        setSaveState("error");
        setMessage(completionError.message);
        return;
      }

      if ((count ?? 0) > 0) {
        setSaveState("error");
        setMessage("This week already contains completed sessions, so it is locked from replacement.");
        return;
      }
    }

    const { data: plan, error: planError } = await supabase
      .from("weekly_plans")
      .upsert(
        {
          user_id: athlete.id,
          week_start: weekStart,
          status,
          target_sessions: targetSessions,
          coach_summary: coachSummary || null,
          updated_at: new Date().toISOString(),
          published_at: status === "published" ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,week_start" },
      )
      .select("id")
      .single();

    if (planError || !plan) {
      setSaveState("error");
      setMessage(planError?.message ?? "Could not save weekly plan.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("weekly_plan_id", plan.id);

    if (deleteError) {
      setSaveState("error");
      setMessage(deleteError.message);
      return;
    }

    const sessionRows = sessions.map((session, index) => ({
      weekly_plan_id: plan.id,
      user_id: athlete.id,
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      title: session.title,
      estimated_minutes: Number(session.estimated_minutes),
      optional: session.optional,
      status: "planned",
      sort_order: index,
    }));

    const { data: savedSessions, error: sessionsError } = await supabase
      .from("sessions")
      .insert(sessionRows)
      .select("id,sort_order");

    if (sessionsError || !savedSessions) {
      setSaveState("error");
      setMessage(sessionsError?.message ?? "Could not save sessions.");
      return;
    }

    const idBySortOrder = new Map(savedSessions.map((session) => [session.sort_order, session.id]));
    const blockRows = sessions.flatMap((session, sessionIndex) => {
      const sessionId = idBySortOrder.get(sessionIndex);
      if (!sessionId) return [];

      return session.blocks.map((block, blockIndex) => ({
        session_id: sessionId,
        block_type: block.block_type,
        title: block.title,
        duration_minutes: Number(block.duration_minutes),
        instructions: block.instructions || null,
        target_effort_min: Number(block.target_effort_min),
        target_effort_max: Number(block.target_effort_max),
        equipment_key: block.equipment_key || null,
        target_metric: block.target_metric ?? null,
        sort_order: blockIndex,
      }));
    });

    if (blockRows.length > 0) {
      const { error: blocksError } = await supabase.from("session_blocks").insert(blockRows);

      if (blocksError) {
        setSaveState("error");
        setMessage(blocksError.message);
        return;
      }
    }

    setSaveState("saved");
    setMessage(status === "published" ? "Week published to Chantal." : "Draft week saved.");
  };

  return (
    <section className="planner-card">
      <div className="planner-heading">
        <div>
          <span className="eyebrow">COACH WORKFLOW</span>
          <h2>Chantal’s Plan</h2>
          <p className="muted">
            Export her training data, let ChatGPT build the next plan, then import and publish it here.
          </p>
        </div>
        <span className={athlete ? "status-pill status-pill--ready" : "status-pill"}>
          {athlete ? athlete.display_name : "Awaiting login"}
        </span>
      </div>

      {!athlete ? (
        <div className="planner-notice">
          Chantal needs to sign in once before training history can be exported.
        </div>
      ) : null}

      <section className="coach-bridge">
        <div className="coach-bridge-heading">
          <div>
            <span className="eyebrow">CHATGPT COACH BRIDGE</span>
            <h3>Export → ChatGPT → Import → Publish</h3>
            <p className="muted">
              No manual exercise programming needed here. The export contains Chantal’s recent sessions,
              cardio baselines, machine settings and feedback.
            </p>
          </div>
          <span className="bridge-version">1.0</span>
        </div>

        <div className="coach-bridge-actions">
          <button
            className="secondary-button planner-action"
            type="button"
            disabled={bridgeBusy || !athlete}
            onClick={() => void exportCoachBridge()}
          >
            {bridgeBusy ? "Building export…" : "1. Export for ChatGPT"}
          </button>

          <label className="bridge-import-button">
            2. Import ChatGPT Plan
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCoachBridgeFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {bridgeMessage ? <p className="bridge-message">{bridgeMessage}</p> : null}
      </section>

      {hasImportedPlan ? (
        <section className="coach-plan-review">
          <div className="coach-plan-review-heading">
            <div>
              <span className="eyebrow">IMPORTED PLAN</span>
              <h3>Review before publishing</h3>
            </div>
            <div className="planner-summary">
              <span>{targetSessions} sessions</span>
              <span>{totalMinutes} planned minutes</span>
              <span>Starts {weekStart}</span>
            </div>
          </div>

          {coachSummary ? <p className="coach-plan-summary">{coachSummary}</p> : null}

          <div className="coach-plan-session-list">
            {sessions.map((session, sessionIndex) => (
              <article className="coach-plan-session" key={sessionIndex}>
                <div className="coach-plan-session-heading">
                  <div>
                    <span className="week-session-day">{session.scheduled_date}</span>
                    <h4>{session.title}</h4>
                  </div>
                  <strong>{session.estimated_minutes} min</strong>
                </div>

                <div className="coach-plan-block-list">
                  {session.blocks.map((block, blockIndex) => (
                    <div className="coach-plan-block" key={blockIndex}>
                      <strong>{blockIndex + 1}. {block.title}</strong>
                      <span>
                        {block.duration_minutes} min · effort {block.target_effort_min}–{block.target_effort_max}/5
                      </span>
                      {block.equipment_key ? <span>{block.equipment_key.replaceAll("_", " ")}</span> : null}
                      {block.target_metric?.target_speed_kmh != null ? (
                        <span>Target ≈ {block.target_metric.target_speed_kmh} km/h</span>
                      ) : null}
                      {block.target_metric?.target_distance != null ? (
                        <span>
                          Target {block.target_metric.target_distance} {block.target_metric.distance_unit ?? "km"}
                        </span>
                      ) : null}
                      {block.target_metric?.incline_percent != null ? (
                        <span>Incline {block.target_metric.incline_percent}%</span>
                      ) : null}
                      {block.target_metric?.resistance_level != null ? (
                        <span>Level {block.target_metric.resistance_level}</span>
                      ) : null}
                      {block.instructions ? <p>{block.instructions}</p> : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {message ? (
            <p className={saveState === "error" ? "planner-message planner-message--error" : "planner-message"}>
              {message}
            </p>
          ) : null}

          <button
            className="primary-button coach-publish-button"
            type="button"
            disabled={saveState === "saving" || !athlete}
            onClick={() => void savePlan("published")}
          >
            {saveState === "saving" ? "Publishing…" : "3. Publish Plan"}
          </button>
        </section>
      ) : (
        <section className="coach-plan-empty">
          <span aria-hidden="true">📥</span>
          <h3>No imported plan waiting</h3>
          <p>Export the latest data, upload it to ChatGPT, then import the returned plan here.</p>
        </section>
      )}
    </section>
  );
}
