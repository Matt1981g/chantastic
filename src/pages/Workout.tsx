import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

type Block = {
  id: string;
  block_type: string;
  title: string;
  duration_minutes: number | null;
  instructions: string | null;
  target_effort_min: number | null;
  target_effort_max: number | null;
  equipment_key?: string | null;
  target_metric?: {
    resistance_level?: number | null;
    incline_percent?: number | null;
  } | null;
  sort_order: number;
};

type Session = {
  id: string;
  title: string;
  session_type: "cardio" | "swim" | "mixed" | "strength";
  estimated_minutes: number;
  status: "planned" | "in_progress" | "completed" | "skipped";
};

type Stage =
  | "loading"
  | "active"
  | "swim_plan"
  | "swim_active"
  | "feedback"
  | "done"
  | "empty"
  | "error";

type Discomfort = "none" | "minor" | "yes";

function localDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function Workout({
  previewSession,
  previewBlocks,
  onPreviewDone,
}: {
  previewSession?: Session;
  previewBlocks?: Block[];
  onPreviewDone?: () => void;
} = {}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blockIndex, setBlockIndex] = useState(0);
  const [message, setMessage] = useState("");

  const [effort, setEffort] = useState(3);
  const [enjoyment, setEnjoyment] = useState(3);
  const [feeling, setFeeling] = useState(3);
  const [cardioTarget, setCardioTarget] = useState<{
    previousDistance: number;
    previousMinutes: number;
    targetDistance: number;
    unit: "m" | "km";
    speed: number | null;
    resistanceLevel: number | null;
    inclinePercent: number | null;
  } | null>(null);
  const [cardioEquipment, setCardioEquipment] = useState<string | null>(null);
  const [resistanceLevel, setResistanceLevel] = useState<number | "">("");
  const [inclinePercent, setInclinePercent] = useState<number | "">("");
  const [discomfort, setDiscomfort] = useState<Discomfort>("none");
  const [actualMinutes, setActualMinutes] = useState<number | "">("");
  const [distanceValue, setDistanceValue] = useState<number | "">("");
  const [distanceUnit, setDistanceUnit] = useState<"m" | "km">("km");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (previewSession) {
      setSession(previewSession);
      setBlocks(previewBlocks ?? []);
      setStage(previewSession.session_type === "swim" ? "swim_plan" : "active");
      return;
    }

    const loadSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You need to sign in again.");
        setStage("error");
        return;
      }

      const hashQuery = window.location.hash.split("?")[1] ?? "";
      const requestedSessionId = new URLSearchParams(hashQuery).get("session");

      let sessionQuery = supabase
        .from("sessions")
        .select("id,title,session_type,estimated_minutes,status,weekly_plans!inner(status)")
        .eq("user_id", user.id);

      sessionQuery = requestedSessionId
        ? sessionQuery.eq("id", requestedSessionId)
        : sessionQuery.eq("scheduled_date", localDateString());

      const { data: sessionData, error: sessionError } = await sessionQuery
        .eq("weekly_plans.status", "published")
        .order("sort_order")
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        setMessage(sessionError.message);
        setStage("error");
        return;
      }

      if (!sessionData) {
        setStage("empty");
        return;
      }

      const cleanSession = sessionData as unknown as Session;

      if (cleanSession.status === "completed") {
        setSession(cleanSession);
        setStage("done");
        return;
      }

      const { data: blockData, error: blockError } = await supabase
        .from("session_blocks")
        .select("id,block_type,title,duration_minutes,instructions,target_effort_min,target_effort_max,target_metric,equipment_key,sort_order")
        .eq("session_id", cleanSession.id)
        .order("sort_order");

      if (blockError) {
        setMessage(blockError.message);
        setStage("error");
        return;
      }

      const cleanBlocks = (blockData as Block[]) ?? [];
      setSession(cleanSession);
      setBlocks(cleanBlocks);
      setActualMinutes(cleanSession.estimated_minutes);

      const primaryEquipment = cleanBlocks.find((block) => block.block_type === "cardio" && block.equipment_key)?.equipment_key
        ?? cleanBlocks.find((block) => block.equipment_key)?.equipment_key;
      setCardioEquipment(primaryEquipment ?? null);
      const preferredDistanceUnit =
        cleanSession.session_type === "swim" ||
        primaryEquipment === "rower" ||
        primaryEquipment === "concept2_skierg"
          ? "m"
          : "km";
      setDistanceUnit(preferredDistanceUnit);

      if (primaryEquipment) {
        const { data: previousPerformance } = await supabase
          .from("cardio_performance")
          .select("duration_minutes,distance_value,distance_unit,resistance_level,incline_percent,performed_at")
          .eq("user_id", user.id)
          .eq("equipment_key", primaryEquipment)
          .order("performed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (previousPerformance?.distance_value && previousPerformance?.duration_minutes) {
          const previousDistance = Number(previousPerformance.distance_value);
          const previousMinutes = Number(previousPerformance.duration_minutes);
          const cardioMinutes = cleanBlocks
            .filter((block) => block.block_type === "cardio" || block.block_type === "intervals" || block.block_type === "warmup")
            .reduce((sum, block) => sum + Number(block.duration_minutes ?? 0), 0);
          const previousKm =
            previousPerformance.distance_unit === "m" ? previousDistance / 1000 : previousDistance;
          const previousSpeed = previousKm / (previousMinutes / 60);
          const speed = previousSpeed * 1.025;
          const targetKm = speed * (cardioMinutes / 60);
          const targetDistance =
            previousPerformance.distance_unit === "m" ? targetKm * 1000 : targetKm;

          setCardioTarget({
            previousDistance,
            previousMinutes,
            targetDistance,
            unit: previousPerformance.distance_unit as "m" | "km",
            speed,
            resistanceLevel:
              previousPerformance.resistance_level == null ? null : Number(previousPerformance.resistance_level),
            inclinePercent:
              previousPerformance.incline_percent == null ? null : Number(previousPerformance.incline_percent),
          });
        }
      }

      if (cleanSession.session_type === "swim") {
        setStage(cleanSession.status === "in_progress" ? "swim_active" : "swim_plan");
        return;
      }

      const { error: startError } = await supabase.rpc("start_session", {
        p_session_id: cleanSession.id,
      });

      if (startError) {
        setMessage(startError.message);
        setStage("error");
        return;
      }

      setSession({ ...cleanSession, status: "in_progress" });
      setStage("active");
    };

    void loadSession();
  }, [previewSession, previewBlocks]);

  const currentBlock = blocks[blockIndex] ?? null;

  const progress = useMemo(() => {
    if (!blocks.length) return 0;
    return Math.round(((blockIndex + 1) / blocks.length) * 100);
  }, [blockIndex, blocks.length]);

  const startSwim = async () => {
    if (!session) return;

    if (!previewSession && session.status === "planned") {
      const { error } = await supabase.rpc("start_session", {
        p_session_id: session.id,
      });

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setSession((current) => current ? { ...current, status: "in_progress" } : current);
    setMessage("");
    setStage("swim_active");
  };

  const submitFeedback = async () => {
    if (!session) return;

    if (previewSession) {
      setStage("done");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("complete_session_feedback_v3", {
      p_session_id: session.id,
      p_effort: effort,
      p_enjoyment: enjoyment,
      p_post_feeling:
        feeling >= 5 ? "great" :
        feeling === 4 ? "great" :
        feeling === 3 ? "okay" :
        feeling === 2 ? "tired" : "very_tired",
      p_discomfort: discomfort,
      p_actual_minutes: actualMinutes === "" ? null : Number(actualMinutes),
      p_distance_value: distanceValue === "" ? null : Number(distanceValue),
      p_distance_unit: distanceValue === "" ? null : distanceUnit,
      p_cardio_equipment_key: cardioEquipment,
      p_resistance_level: resistanceLevel === "" ? null : Number(resistanceLevel),
      p_incline_percent: inclinePercent === "" ? null : Number(inclinePercent),
      p_notes: notes,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setStage("done");
  };

  if (stage === "loading") {
    return (
      <main className="page workout-page">
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">✨</span>
          <h2>Getting your session ready…</h2>
        </section>
      </main>
    );
  }

  if (stage === "empty") {
    return (
      <main className="page workout-page">
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">🌿</span>
          <h2>No session today</h2>
          <p>Enjoy the easy day. Your next planned session will appear automatically.</p>
          {onPreviewDone ? (
            <button className="start-session-button" type="button" onClick={onPreviewDone}>
              Back to preview
            </button>
          ) : (
            <a className="start-session-button" href="#/">Back to Today</a>
          )}
        </section>
      </main>
    );
  }

  if (stage === "error") {
    return (
      <main className="page workout-page">
        <section className="empty-card">
          <span className="empty-icon" aria-hidden="true">⚠️</span>
          <h2>Something went wrong</h2>
          <p>{message}</p>
          <a className="start-session-button" href="#/">Back to Today</a>
        </section>
      </main>
    );
  }

  if (stage === "done") {
    return (
      <main className="page workout-page">
        <section className="completion-card">
          <span className="completion-icon" aria-hidden="true">🎉</span>
          <span className="eyebrow">SESSION COMPLETE</span>
          <h1>Nice work.</h1>
          <p>
            {previewSession
              ? "Preview complete. Nothing was saved."
              : "That’s it. Your feedback has been saved and your coach can see how the session went."}
          </p>
          {onPreviewDone ? (
            <button className="start-session-button" type="button" onClick={onPreviewDone}>
              Back to preview
            </button>
          ) : (
            <a className="start-session-button" href="#/">Back to Today</a>
          )}
        </section>
      </main>
    );
  }

  if (stage === "feedback") {
    return (
      <main className="page workout-page">
        <section className="section-header">
          <span className="eyebrow">QUICK CHECK-IN</span>
          <h1>How did that feel?</h1>
          <p className="muted">A few taps. No essays required.</p>
        </section>

        <section className="feedback-card">
          <div className="feedback-field">
            <span>What did you actually do?</span>
            <div className="performance-input-grid">
              <label>
                Time (minutes)
                <input
                  type="number"
                  min={1}
                  max={50}
                  inputMode="numeric"
                  value={actualMinutes}
                  onChange={(event) =>
                    setActualMinutes(event.target.value === "" ? "" : Math.min(50, Number(event.target.value)))
                  }
                />
              </label>

              <label>
                Distance
                <div className="distance-input">
                  <input
                    type="number"
                    min={0}
                    step={distanceUnit === "km" ? 0.01 : 1}
                    inputMode="decimal"
                    placeholder="Optional"
                    value={distanceValue}
                    onChange={(event) =>
                      setDistanceValue(event.target.value === "" ? "" : Number(event.target.value))
                    }
                  />
                  <select
                    value={distanceUnit}
                    onChange={(event) => setDistanceUnit(event.target.value as "m" | "km")}
                  >
                    <option value="km">km</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </label>
            </div>
            {cardioEquipment === "treadmill" ? (
              <label className="cardio-setting-field">
                Treadmill incline (%)
                <input type="number" min={0} max={40} step={0.5} inputMode="decimal"
                  value={inclinePercent}
                  onChange={(event) => setInclinePercent(event.target.value === "" ? "" : Number(event.target.value))} />
              </label>
            ) : cardioEquipment && ["cross_trainer","bike","rower","concept2_skierg","stepper"].includes(cardioEquipment) ? (
              <label className="cardio-setting-field">
                Resistance / level
                <input type="number" min={0} step={1} inputMode="decimal"
                  value={resistanceLevel}
                  onChange={(event) => setResistanceLevel(event.target.value === "" ? "" : Number(event.target.value))} />
              </label>
            ) : null}
            <small>Use the machine display. Distance and machine setting let Chantastic plan the next target properly.</small>
          </div>

          <label className="feedback-field">
            <span>Effort</span>
            <strong>{effort}/5</strong>
            <input
              type="range"
              min={1}
              max={5}
              value={effort}
              onChange={(event) => setEffort(Number(event.target.value))}
            />
            <small>1 = very easy · 2 = easy · 3 = moderate · 4 = hard · 5 = maximum</small>
          </label>

          <label className="feedback-field">
            <span>Enjoyment</span>
            <strong>{enjoyment}/5</strong>
            <input
              type="range"
              min={1}
              max={5}
              value={enjoyment}
              onChange={(event) => setEnjoyment(Number(event.target.value))}
            />
          </label>

          <label className="feedback-field">
            <span>How do you feel now?</span>
            <strong>{feeling}/5</strong>
            <input type="range" min={1} max={5} value={feeling} onChange={(event) => setFeeling(Number(event.target.value))} />
            <small>1 = exhausted · 2 = tired · 3 = okay · 4 = good · 5 = great</small>
          </label>

          <div className="feedback-field">
            <span>Any discomfort?</span>
            <div className="choice-grid choice-grid--three">
              {[
                ["none", "No"],
                ["minor", "A little"],
                ["yes", "Yes"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={discomfort === value ? "active" : ""}
                  onClick={() => setDiscomfort(value as Discomfort)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <small className="slider-guide">Enjoyment: 1 = hated it · 2 = disliked it · 3 = neutral · 4 = enjoyed it · 5 = loved it</small>

          <label className="feedback-field">
            <span>Anything else?</span>
            <textarea
              rows={3}
              placeholder="Optional note"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {message ? <p className="planner-message planner-message--error">{message}</p> : null}

          <button
            className="primary-button feedback-submit"
            type="button"
            disabled={saving}
            onClick={() => void submitFeedback()}
          >
            {saving ? "Saving…" : "Save & finish"}
          </button>
        </section>
      </main>
    );
  }

  if (stage === "swim_plan") {
    return (
      <main className="page workout-page">
        <section className="workout-header">
          <span className="eyebrow">SWIM SESSION</span>
          <h1>{session?.title}</h1>
          <p>{session?.estimated_minutes} minutes</p>
        </section>

        <section className="swim-plan-card">
          <div className="swim-phone-note">
            <span aria-hidden="true">📱➡️🔒</span>
            <div>
              <strong>Read it, start it, put the phone away.</strong>
              <p>No phone interaction needed in the pool.</p>
            </div>
          </div>

          <div className="swim-plan-list">
            {blocks.filter((block) => block.block_type === "swim").map((block, index) => (
              <article className="swim-plan-block" key={block.id}>
                <span className="swim-plan-number">{index + 1}</span>
                <div>
                  <h2>{block.title}</h2>
                  <div className="swim-plan-meta">
                    {block.duration_minutes ? <span>{block.duration_minutes} min</span> : null}
                    {block.target_effort_min && block.target_effort_max ? (
                      <span>Effort {block.target_effort_min}–{block.target_effort_max}/5</span>
                    ) : null}
                  </div>
                  {block.instructions ? <p>{block.instructions}</p> : null}
                </div>
              </article>
            ))}
          </div>

          {message ? <p className="planner-message planner-message--error">{message}</p> : null}

          <button className="primary-button swim-main-button" type="button" onClick={() => void startSwim()}>
            Start Swim
          </button>
        </section>
      </main>
    );
  }

  if (stage === "swim_active") {
    return (
      <main className="page workout-page swim-active-page">
        <section className="swim-active-card">
          <span className="swim-active-icon" aria-hidden="true">🏊</span>
          <span className="eyebrow">SWIM IN PROGRESS</span>
          <h1>Phone away.</h1>
          <p>Enjoy the swim. Come back here when you’re finished.</p>
          <button className="swim-stop-button" type="button" onClick={() => setStage("feedback")}>
            Stop Swim
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page workout-page">
      <section className="workout-header">
        <span className="eyebrow">TODAY’S SESSION</span>
        <h1>{session?.title}</h1>
        <p>{session?.estimated_minutes} minutes</p>
      </section>

      <div className="workout-progress" aria-label={"Session progress " + progress + "%"}>
        <span style={{ width: progress + "%" }} />
      </div>

      {currentBlock ? (
        <section className="workout-block-card">
          <div className="workout-block-count">
            Step {blockIndex + 1} of {blocks.length}
          </div>
          <span className="workout-block-icon" aria-hidden="true">
            {currentBlock.equipment_key === "treadmill" ? "🚶" :
             currentBlock.equipment_key === "rower" ? "🚣" :
             currentBlock.equipment_key === "bike" ? "🚴" :
             currentBlock.equipment_key === "cross_trainer" ? "🏃" :
             currentBlock.equipment_key === "concept2_skierg" ? "⛷️" :
             currentBlock.equipment_key === "stepper" ? "🪜" :
             currentBlock.block_type === "swim" ? "🏊" :
             currentBlock.block_type === "strength" ? "🏋️" :
             currentBlock.block_type === "cooldown" ? "🌿" : "✨"}
          </span>
          <h2>{currentBlock.title}</h2>

          {currentBlock.duration_minutes ? (
            <div className="workout-duration">{currentBlock.duration_minutes} min</div>
          ) : null}

          {currentBlock.instructions ? (
            <p className="workout-instructions">{currentBlock.instructions}</p>
          ) : null}

          {cardioTarget && (currentBlock.block_type === "cardio" || currentBlock.block_type === "intervals") ? (
            <div className="progression-target">
              <strong>Next target: {cardioTarget.targetDistance.toFixed(cardioTarget.unit === "km" ? 2 : 0)} {cardioTarget.unit}</strong>
              <span>
                Previous: {cardioTarget.previousDistance} {cardioTarget.unit} in {cardioTarget.previousMinutes} min · +2.5%
                {cardioTarget.speed ? " · Aim ≈ " + cardioTarget.speed.toFixed(1) + " km/h" : ""}
              </span>
              <span>
                {cardioEquipment === "treadmill"
                  ? "Incline: " + (cardioTarget.inclinePercent ?? 0) + "%"
                  : cardioTarget.resistanceLevel != null
                    ? "Keep resistance / level at " + cardioTarget.resistanceLevel
                    : "Record the resistance / level this time to complete the baseline."}
              </span>
            </div>
          ) : null}

          {currentBlock.target_effort_min && currentBlock.target_effort_max ? (
            <div className="effort-target">
              Target effort {currentBlock.target_effort_min}–{currentBlock.target_effort_max}/10
            </div>
          ) : null}
        </section>
      ) : (
        <section className="workout-block-card">
          <h2>Ready to finish?</h2>
          <p className="workout-instructions">Your session has no programmed blocks.</p>
        </section>
      )}

      <div className="workout-controls">
        <button
          className="secondary-button planner-action"
          type="button"
          disabled={blockIndex === 0}
          onClick={() => setBlockIndex((current) => Math.max(0, current - 1))}
        >
          Back
        </button>

        <button
          className="primary-button planner-action"
          type="button"
          onClick={() => {
            if (blockIndex < blocks.length - 1) {
              const nextIndex = blockIndex + 1;
              setBlockIndex(nextIndex);
              if (blocks[nextIndex]?.block_type === "swim") {
                setStage("swim_plan");
              }
            } else {
              setStage("feedback");
            }
          }}
        >
          {blockIndex < blocks.length - 1 ? "Next" : "Finish session"}
        </button>
      </div>
    </main>
  );
}
