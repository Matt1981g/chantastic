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
  sort_order: number;
};

type Session = {
  id: string;
  title: string;
  session_type: "cardio" | "swim" | "mixed" | "strength";
  estimated_minutes: number;
  status: "planned" | "in_progress" | "completed" | "skipped";
};

type Stage = "loading" | "active" | "feedback" | "done" | "empty" | "error";
type Feeling = "great" | "okay" | "tired" | "very_tired";
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

  const [effort, setEffort] = useState(6);
  const [enjoyment, setEnjoyment] = useState(7);
  const [postFeeling, setPostFeeling] = useState<Feeling>("okay");
  const [discomfort, setDiscomfort] = useState<Discomfort>("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (previewSession) {
      setSession(previewSession);
      setBlocks(previewBlocks ?? []);
      setStage("active");
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

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id,title,session_type,estimated_minutes,status,weekly_plans!inner(status)")
        .eq("user_id", user.id)
        .eq("scheduled_date", localDateString())
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
        .select("id,block_type,title,duration_minutes,instructions,target_effort_min,target_effort_max,sort_order")
        .eq("session_id", cleanSession.id)
        .order("sort_order");

      if (blockError) {
        setMessage(blockError.message);
        setStage("error");
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

      setSession(cleanSession);
      setBlocks((blockData as Block[]) ?? []);
      setStage("active");
    };

    void loadSession();
  }, [previewSession, previewBlocks]);

  const currentBlock = blocks[blockIndex] ?? null;
  const progress = useMemo(() => {
    if (!blocks.length) return 0;
    return Math.round(((blockIndex + 1) / blocks.length) * 100);
  }, [blockIndex, blocks.length]);

  const submitFeedback = async () => {
    if (!session) return;

    if (previewSession) {
      setStage("done");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("complete_session_feedback", {
      p_session_id: session.id,
      p_effort: effort,
      p_enjoyment: enjoyment,
      p_post_feeling: postFeeling,
      p_discomfort: discomfort,
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
            <button className="start-session-button" type="button" onClick={onPreviewDone}>Back to preview</button>
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
          <label className="feedback-field">
            <span>Effort</span>
            <strong>{effort}/10</strong>
            <input
              type="range"
              min={1}
              max={10}
              value={effort}
              onChange={(event) => setEffort(Number(event.target.value))}
            />
            <small>1 = very easy · 10 = maximum effort</small>
          </label>

          <label className="feedback-field">
            <span>Enjoyment</span>
            <strong>{enjoyment}/10</strong>
            <input
              type="range"
              min={1}
              max={10}
              value={enjoyment}
              onChange={(event) => setEnjoyment(Number(event.target.value))}
            />
          </label>

          <div className="feedback-field">
            <span>How do you feel now?</span>
            <div className="choice-grid">
              {[
                ["great", "😊 Great"],
                ["okay", "🙂 Okay"],
                ["tired", "😮‍💨 Tired"],
                ["very_tired", "🥱 Very tired"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={postFeeling === value ? "active" : ""}
                  onClick={() => setPostFeeling(value as Feeling)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

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
            {currentBlock.block_type === "swim"
              ? "🏊"
              : currentBlock.block_type === "warmup"
                ? "🌤️"
                : currentBlock.block_type === "cooldown"
                  ? "🌿"
                  : currentBlock.block_type === "strength"
                    ? "🏋️"
                    : "🚴"}
          </span>
          <h2>{currentBlock.title}</h2>

          {currentBlock.duration_minutes ? (
            <div className="workout-duration">{currentBlock.duration_minutes} min</div>
          ) : null}

          {currentBlock.instructions ? (
            <p className="workout-instructions">{currentBlock.instructions}</p>
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
              setBlockIndex((current) => current + 1);
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
