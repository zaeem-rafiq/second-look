import { useEffect, useRef, useState } from "react";
import { useAction, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { CaseCard } from "./App";

type Session = { token: string; siblingToken?: string };
type Sample = "suspicious" | "legitimate" | "unverifiable";
const STORAGE_KEY = "second-look-demo";
const samples: { id: Sample; title: string; description: string; number: string }[] = [
  { id: "suspicious", title: "Suspicious mail", description: "An urgent request that doesn't match the cited source.", number: "01" },
  { id: "legitimate", title: "Legitimate notice", description: "A routine notice whose checkable details match.", number: "02" },
  { id: "unverifiable", title: "Cannot verify", description: "A forwarded message without enough evidence to confirm.", number: "03" },
];

function readSession(): Session | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (token) return { token };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
    return saved && typeof saved.token === "string" ? saved : null;
  } catch { return null; }
}

export function Demo() {
  const start = useAction(api.demo.start);
  const runSample = useMutation(api.demo.runSample);
  const reset = useMutation(api.demo.reset);
  const addNote = useMutation(api.demo.addNote);
  const markHandled = useMutation(api.demo.markHandled);
  const connection = useConvexConnectionState();
  const [session, setSession] = useState(readSession);
  const [busy, setBusy] = useState<Sample | "reset" | null>(null);
  const [error, setError] = useState("");
  const board = useQuery(api.demo.board, session ? { token: session.token } : "skip");
  const boardSection = useRef<HTMLElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const update = () => { setSession(readSession()); setError(""); };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (board?.demo.participant === "Sam") boardSection.current?.scrollIntoView({ block: "start" });
  }, [board?.demo.participant, session?.token]);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const reportError = (reason: unknown) => setError(reason instanceof ConvexError && typeof reason.data === "string"
    ? reason.data : "That didn't finish. Check your connection and try the same sample again.");
  const run = async (sample: Sample) => {
    if (busy) return;
    setBusy(sample); setError("");
    try {
      let current = session;
      if (!current) {
        current = await start({});
        setSession(current);
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* This tab still works without storage. */ }
      }
      await runSample({ token: current.token, sample });
      boardSection.current?.scrollIntoView({ block: "start" });
      boardSection.current?.focus({ preventScroll: true });
    } catch (reason) { reportError(reason); }
    finally { setBusy(null); }
  };

  return (
    <main className="shell demo-shell">
      <nav className="demo-nav" aria-label="Main">
        <a className="wordmark" href="?demo=1">Second Look<span aria-hidden="true"> ↗</span></a>
        <a href="?signin=1">Family sign in</a>
      </nav>

      <header className="demo-hero">
        <p className="eyebrow">A second pair of eyes on your parent's mail</p>
        <h1>A confusing email.<br />A calmer next step.</h1>
        <p>Your parent forwards a message. Second Look checks the details against published sources, prepares a plain-language reply, and keeps the family in the loop.</p>
        <ol className="how-it-works" aria-label="How Second Look works">
          <li><span>1</span><div><strong>Forward</strong><p>Your parent uses email. No new app or account.</p></div></li>
          <li><span>2</span><div><strong>Check</strong><p>See what matched, what didn't, and the source.</p></div></li>
          <li><span>3</span><div><strong>Follow up together</strong><p>Add a note so everyone knows who's helping.</p></div></li>
        </ol>
      </header>

      <section className="demo-samples" aria-labelledby="try-title">
        <div className="section-heading"><div><p className="eyebrow">No sign-up needed</p><h2 id="try-title">Try a synthetic forward</h2></div><span className="demo-label">Fictional mail · Real processing</span></div>
        <p className="muted small">These invented messages run through the same workflow and verdict checks as the family board. This demo uses deterministic extraction and saved reference sources; external AI, fresh web lookup and email delivery are off. Every reply stays an unsent draft.</p>
        <div className="sample-grid">
          {samples.map((sample) => <button key={sample.id} className="sample-button" disabled={busy !== null || (session !== null && !board) || board?.demo.canRun === false} onClick={() => void run(sample.id)}>
            <span className="sample-number">{sample.number} / SYNTHETIC</span>
            <strong>{sample.title}</strong><span>{sample.description}</span>
            <span className="sample-cta">{busy === sample.id ? "Starting…" : `Run ${sample.title.toLowerCase()}`} <span aria-hidden="true">→</span></span>
          </button>)}
        </div>
        {!connection.isWebSocketConnected && <p className="notice" role="status">Connecting to the live board… Changes appear when the connection returns.</p>}
      </section>

      <section ref={boardSection} tabIndex={-1} className="demo-board" aria-labelledby="demo-board-title">
        <div className="section-heading"><div><p className="eyebrow">Live family board</p><h2 id="demo-board-title">A shared next step</h2></div>{board && <span className="live-label"><span aria-hidden="true">●</span> Viewing as {board.demo.participant}</span>}</div>
        {error && <p ref={errorMessage} className="error" role="alert">{error}</p>}
        {!session ? <div className="empty"><h3>Your first forward goes here</h3><p className="muted">Choose a sample above to watch it move from reading to a verdict and reply draft.</p></div>
          : board === undefined ? <p className="notice" role="status">Loading your isolated demo…</p>
          : board === null ? <div className="notice" role="status"><h3>This demo has ended</h3><p>The link may have expired. Start a new demo to get your own fresh board.</p><button onClick={() => {
            try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Optional persistence. */ }
            history.replaceState(null, "", "?demo=1"); setSession(null); setError("");
          }}>Start a new demo</button></div>
          : <>
            <div className="demo-coordination">
              <div><h3>Bring another family member in</h3><p className="muted small">Alex and Sam are fictional demo members. Open Sam's view, add a note and mark a message handled. Watch this board update without refreshing.</p>
                {session.siblingToken ? <a className="button-link" href={`?demo=1#token=${encodeURIComponent(session.siblingToken)}`} target="_blank" rel="noreferrer">Open Sam's view <span aria-hidden="true">↗</span></a> : <p className="small">You're in {board.demo.participant}'s view. Notes and handled updates appear for the other member immediately.</p>}
              </div>
              <div className="demo-reset"><p className="muted small">This board is isolated from other visitors and private families. Ends at {new Date(board.demo.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
                {board.demo.canRun && <button className="secondary" disabled={busy !== null || board.cases.length === 0} onClick={async () => {
                  setBusy("reset"); setError("");
                  try { await reset({ token: session.token }); } catch (reason) { reportError(reason); } finally { setBusy(null); }
                }}>{busy === "reset" ? "Resetting…" : "Reset samples"}</button>}
              </div>
            </div>
            <p className="muted small">Repeating a sample reopens its existing case. Reset after processing finishes to run it again (once per minute; {board.demo.resetsRemaining} resets and {board.demo.runsRemaining} runs left). Nothing is emailed. If a run fails, select its sample again to retry.</p>
            {board.cases.length === 0 ? <div className="empty"><h3>Ready for a fresh forward</h3><p className="muted">Choose one of the three samples. Sam's view stays connected.</p></div> : <div className="cards">{board.cases.map((c) => <CaseCard key={c._id} c={c} onAddNote={(args) => addNote({ ...args, token: session.token })} onMarkHandled={(args) => markHandled({ ...args, token: session.token })} />)}</div>}
          </>}
      </section>
      <footer className="demo-footer"><strong>Ready to help your own family?</strong><p>Create a private board, ask your parent to confirm their email, then invite the people who help.</p><a href="?signin=1">Set up your family →</a></footer>
    </main>
  );
}
