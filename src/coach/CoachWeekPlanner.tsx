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
};

type SessionDraft = {
  scheduled_date: string;
  session_type: SessionType;
  title: string;
  estimated_minutes: number;
  optional: boolean;
  blocks: BlockDraft[];
};

const sessionLabels: Record<SessionType, string> = {
  cardio: "Cardio",
  swim: "Swim",
  mixed: "Mixed cardio",
  strength: "Strength",
};

function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00");
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function defaultBlocks(type: SessionType): BlockDraft[] {
  if (type === "swim") {
    return [
      { title: "Easy warm-up", block_type: "warmup", duration_minutes: 5, instructions: "Relaxed swimming, any comfortable stroke.", target_effort_min: 2, target_effort_max: 4 },
      { title: "Steady swim", block_type: "swim", duration_minutes: 35, instructions: "Comfortable continuous swimming. Rest whenever needed.", target_effort_min: 4, target_effort_max: 6 },
      { title: "Cool-down", block_type: "cooldown", duration_minutes: 5, instructions: "Very easy swimming.", target_effort_min: 1, target_effort_max: 3 },
    ];
  }

  return [
    { title: "Warm-up", block_type: "warmup", duration_minutes: 5, instructions: "Easy pace.", target_effort_min: 2, target_effort_max: 4 },
    { title: "Main work", block_type: type === "strength" ? "strength" : "cardio", duration_minutes: 35, instructions: "Comfortable, controlled work.", target_effort_min: 4, target_effort_max: 6 },
    { title: "Cool-down", block_type: "cooldown", duration_minutes: 5, instructions: "Reduce the pace gradually.", target_effort_min: 1, target_effort_max: 3 },
  ];
}

function makeSession(weekStart: string, index: number): SessionDraft {
  const offsets = [0, 2, 4, 5, 6];
  const type: SessionType = index === 1 ? "swim" : "cardio";

  return {
    scheduled_date: addDays(weekStart, offsets[index] ?? index),
    session_type: type,
    title: type === "swim" ? "Easy Swim" : "Cardio Session",
    estimated_minutes: 50,
    optional: index >= 3,
    blocks: defaultBlocks(type),
  };
}

export default function CoachWeekPlanner() {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [weekStart, setWeekStart] = useState(mondayOfCurrentWeek);
  const [targetSessions, setTargetSessions] = useState(3);
  const [sessions, setSessions] = useState<SessionDraft[]>(() =>
    Array.from({ length: 3 }, (_, index) => makeSession(mondayOfCurrentWeek(), index)),
  );
  const [coachSummary, setCoachSummary] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadAthlete = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .eq("role", "user")
        .limit(1)
        .maybeSingle();

      setAthlete(data ?? null);
    };

    void loadAthlete();
  }, []);

  const totalMinutes = useMemo(
    () => sessions.reduce((sum, session) => sum + Number(session.estimated_minutes || 0), 0),
    [sessions],
  );

  const setCount = (count: number) => {
    setTargetSessions(count);
    setSessions((current) => {
      if (current.length === count) return current;
      if (current.length > count) return current.slice(0, count);

      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) =>
          makeSession(weekStart, current.length + index),
        ),
      ];
    });
  };

  const updateSession = <K extends keyof SessionDraft>(
    index: number,
    key: K,
    value: SessionDraft[K],
  ) => {
    setSessions((current) =>
      current.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [key]: value } : session,
      ),
    );
  };

  const updateBlock = <K extends keyof BlockDraft>(
    sessionIndex: number,
    blockIndex: number,
    key: K,
    value: BlockDraft[K],
  ) => {
    setSessions((current) =>
      current.map((session, currentSessionIndex) => {
        if (currentSessionIndex !== sessionIndex) return session;

        return {
          ...session,
          blocks: session.blocks.map((block, currentBlockIndex) =>
            currentBlockIndex === blockIndex ? { ...block, [key]: value } : block,
          ),
        };
      }),
    );
  };

  const changeSessionType = (index: number, type: SessionType) => {
    setSessions((current) =>
      current.map((session, sessionIndex) =>
        sessionIndex === index
          ? {
              ...session,
              session_type: type,
              title: sessionLabels[type] + " Session",
              blocks: defaultBlocks(type),
            }
          : session,
      ),
    );
  };

  const addBlock = (sessionIndex: number) => {
    setSessions((current) =>
      current.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              blocks: [
                ...session.blocks,
                {
                  title: "New block",
                  block_type: "other",
                  duration_minutes: 10,
                  instructions: "",
                  target_effort_min: 4,
                  target_effort_max: 6,
                },
              ],
            }
          : session,
      ),
    );
  };

  const removeBlock = (sessionIndex: number, blockIndex: number) => {
    setSessions((current) =>
      current.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              blocks: session.blocks.filter((_, currentBlockIndex) => currentBlockIndex !== blockIndex),
            }
          : session,
      ),
    );
  };

  const savePlan = async (status: PlanStatus) => {
    if (!athlete) {
      setSaveState("error");
      setMessage("Chantal needs to sign in once before a programme can be assigned.");
      return;
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
          <span className="eyebrow">WEEKLY PROGRAMME</span>
          <h2>Build Chantal’s Week</h2>
          <p className="muted">
            Create the same structure ChatGPT will later import automatically.
          </p>
        </div>
        <span className={athlete ? "status-pill status-pill--ready" : "status-pill"}>
          {athlete ? athlete.display_name : "Awaiting login"}
        </span>
      </div>

      {!athlete ? (
        <div className="planner-notice">
          Chantal needs to sign in to Chantastic once. Her user profile will then appear here automatically.
        </div>
      ) : null}

      <div className="planner-toolbar">
        <label>
          Week starting
          <input
            type="date"
            value={weekStart}
            onChange={(event) => {
              setWeekStart(event.target.value);
              setSessions((current) =>
                current.map((session, index) => ({
                  ...session,
                  scheduled_date: addDays(event.target.value, [0, 2, 4, 5, 6][index] ?? index),
                })),
              );
            }}
          />
        </label>

        <div className="session-count-field">
          <span>Sessions</span>
          <div className="segmented-control">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                className={targetSessions === count ? "active" : ""}
                onClick={() => setCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="full-field">
        Coach summary
        <textarea
          rows={2}
          placeholder="Optional note about the focus for this week."
          value={coachSummary}
          onChange={(event) => setCoachSummary(event.target.value)}
        />
      </label>

      <div className="planner-summary">
        <span>{targetSessions} sessions</span>
        <span>{totalMinutes} planned minutes</span>
      </div>

      <div className="session-editor-list">
        {sessions.map((session, sessionIndex) => (
          <article className="session-editor" key={sessionIndex}>
            <div className="session-editor-heading">
              <div>
                <span className="eyebrow">SESSION {sessionIndex + 1}</span>
                <input
                  className="title-input"
                  value={session.title}
                  onChange={(event) => updateSession(sessionIndex, "title", event.target.value)}
                />
              </div>
              <label className="optional-toggle">
                <input
                  type="checkbox"
                  checked={session.optional}
                  onChange={(event) => updateSession(sessionIndex, "optional", event.target.checked)}
                />
                Optional
              </label>
            </div>

            <div className="session-fields">
              <label>
                Date
                <input
                  type="date"
                  value={session.scheduled_date}
                  onChange={(event) => updateSession(sessionIndex, "scheduled_date", event.target.value)}
                />
              </label>

              <label>
                Type
                <select
                  value={session.session_type}
                  onChange={(event) => changeSessionType(sessionIndex, event.target.value as SessionType)}
                >
                  {Object.entries(sessionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Minutes
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={session.estimated_minutes}
                  onChange={(event) =>
                    updateSession(sessionIndex, "estimated_minutes", Number(event.target.value))
                  }
                />
              </label>
            </div>

            <div className="block-editor-list">
              {session.blocks.map((block, blockIndex) => (
                <div className="block-editor" key={blockIndex}>
                  <div className="block-topline">
                    <input
                      value={block.title}
                      onChange={(event) =>
                        updateBlock(sessionIndex, blockIndex, "title", event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => removeBlock(sessionIndex, blockIndex)}
                      aria-label={"Remove " + block.title}
                    >
                      ×
                    </button>
                  </div>

                  <div className="block-fields">
                    <label>
                      Block
                      <select
                        value={block.block_type}
                        onChange={(event) =>
                          updateBlock(
                            sessionIndex,
                            blockIndex,
                            "block_type",
                            event.target.value as BlockDraft["block_type"],
                          )
                        }
                      >
                        <option value="warmup">Warm-up</option>
                        <option value="cardio">Cardio</option>
                        <option value="swim">Swim</option>
                        <option value="strength">Strength</option>
                        <option value="intervals">Intervals</option>
                        <option value="cooldown">Cool-down</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <label>
                      Minutes
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={block.duration_minutes}
                        onChange={(event) =>
                          updateBlock(sessionIndex, blockIndex, "duration_minutes", Number(event.target.value))
                        }
                      />
                    </label>

                    <label>
                      Effort
                      <div className="effort-range">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={block.target_effort_min}
                          onChange={(event) =>
                            updateBlock(sessionIndex, blockIndex, "target_effort_min", Number(event.target.value))
                          }
                        />
                        <span>–</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={block.target_effort_max}
                          onChange={(event) =>
                            updateBlock(sessionIndex, blockIndex, "target_effort_max", Number(event.target.value))
                          }
                        />
                      </div>
                    </label>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Instructions"
                    value={block.instructions}
                    onChange={(event) =>
                      updateBlock(sessionIndex, blockIndex, "instructions", event.target.value)
                    }
                  />
                </div>
              ))}
            </div>

            <button className="text-button" type="button" onClick={() => addBlock(sessionIndex)}>
              + Add block
            </button>
          </article>
        ))}
      </div>

      {message ? (
        <p className={saveState === "error" ? "planner-message planner-message--error" : "planner-message"}>
          {message}
        </p>
      ) : null}

      <div className="planner-actions">
        <button
          className="secondary-button planner-action"
          type="button"
          disabled={saveState === "saving"}
          onClick={() => void savePlan("draft")}
        >
          Save Draft
        </button>
        <button
          className="primary-button planner-action"
          type="button"
          disabled={saveState === "saving" || !athlete}
          onClick={() => void savePlan("published")}
        >
          {saveState === "saving" ? "Saving…" : "Publish Week"}
        </button>
      </div>
    </section>
  );
}
