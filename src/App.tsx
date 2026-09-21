import { useEffect, useState } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { demoBoard } from "./demo";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export type Board = NonNullable<FunctionReturnType<typeof api.cases.listBoard>>;
type Case = Board["cases"][number];

const STEPS: { key: Case["status"][]; label: (c: Case) => string }[] = [
  { key: ["received"], label: () => "Received" },
  { key: ["extracting"], label: () => "Reading" },
  { key: ["resolving_org", "checking"], label: (c) => (c.orgName ? `Checking ${orgDomainLabel(c)}` : "Checking") },
  { key: ["replying"], label: () => "Verdict" },
  { key: ["replied"], label: (c) => c.replyStatus === "unsent" ? "Unsent" : c.replyStatus === "sending" ? "Sending…" : c.replyStatus === "failed" ? "Send failed" : c.replyStatus === "sent" ? "Sent" : "Reply" },
];

function orgDomainLabel(c: Case): string {
  const src = c.evidence.find((e) => e.sourceUrl)?.sourceUrl;
  try {
    return src ? new URL(src).hostname.replace(/^www\./, "") : c.orgName ?? "";
  } catch {
    return c.orgName ?? "";
  }
}

function verdictLabel(v: Case["verdict"]): string {
  switch (v) {
    case "matches_official":
      return "Matches official source";
    case "mismatch":
      return "Mismatch";
    case "cannot_verify":
      return "Can't verify";
    default:
      return "Checking…";
  }
}

const CHECK_LABELS: Record<string, string> = {
  sender_domain: "Quoted sender address",
  link_domains: "Links",
  phone: "Phone number",
  policy_contradiction: "What they say vs. official policy",
  urgency_pressure: "Time pressure",
  payment_method: "Payment method",
};

const PAYMENT_WORDS: Record<string, string> = { gift_card: "gift card", crypto: "cryptocurrency", wire: "wire or money transfer" };

/** "gift_card, wire" -> "gift card or wire or money transfer" */
function paymentWords(claim: string): string {
  return claim
    .split(/,\s*/)
    .filter(Boolean)
    .map((m) => PAYMENT_WORDS[m] ?? m.replace(/_/g, " "))
    .join(" or ");
}

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDay(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") return <BoardView board={demoBoard} readOnly />;
  if (isLoading) return <main className="shell"><p className="muted">Checking your sign-in…</p></main>;
  if (!isAuthenticated) return <SignIn />;
  return <><nav className="shell account-bar"><span>Private family board</span><button className="secondary" onClick={() => void signOut()}>Sign out</button></nav><FamilyBoard familySlug={params.get("family") ?? "demo"} /></>;
}

function SignIn() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="shell sign-in">
    <p className="eyebrow">Second Look</p><h1>Your family's second look</h1>
    <p className="muted">Sign in with the account set up for your family. Your family's messages and notes are private.</p>
    <form className="sign-in-form" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      data.set("flow", "signIn");
      setBusy(true); setError("");
      try { await signIn("password", data); }
      catch { setError("Could not sign in. Check your email and password, then try again."); }
      finally { setBusy(false); }
    }}>
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={256} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <p className="muted small">Need access or a password reset? Contact the person who set up your family's account.</p>
    <a href="?demo=1">View the synthetic demo</a>
  </main>;
}

function FamilyBoard({ familySlug }: { familySlug: string }) {
  const board = useQuery(api.cases.listBoard, { familySlug });
  if (board === undefined) return <main className="shell"><p className="muted">Loading the board…</p></main>;
  if (board === null) return <main className="shell"><h1>Board unavailable</h1><p className="muted">This account does not have access to that family board.</p><a href="?demo=1">View the synthetic demo</a></main>;
  return <BoardView board={board} />;
}

function BoardView({ board, readOnly = false }: { board: Board; readOnly?: boolean }) {
  return (
    <main className="shell">
      {readOnly && <p className="demo-notice">Synthetic demo · Fictional messages, names, and addresses. <a href="?">Sign in to your family board</a></p>}
      <header className="masthead">
        <div>
          <p className="eyebrow">Second Look</p>
          <h1>{board.family.name}</h1>
          <p className="muted">
            {readOnly ? "This fixed example shows how a family can review a message." : <>{board.parents.map((p) => p.name).join(", ") || "No parent yet"} forwards anything confusing to{" "}
            <code>{board.helperAddress ?? "the helper inbox"}</code>. Every forward shows up here, live.</>}
          </p>
        </div>
        <div className="legend">
          <span className="chip verdict-mismatch">Mismatch</span>
          <span className="chip verdict-matches_official">Matches official source</span>
          <span className="chip verdict-cannot_verify">Can't verify</span>
        </div>
      </header>

      {board.cases.length === 0 ? (
        <section className="empty">
          <h2>Nothing yet</h2>
          <p className="muted">When a forward arrives, a card appears here without a refresh.</p>
        </section>
      ) : (
        <section className="cards">
          {board.cases.map((c) => (
            <CaseCard key={c._id} c={c} readOnly={readOnly} />
          ))}
        </section>
      )}
    </main>
  );
}

function CaseCard({ c, readOnly = false }: { c: Case; readOnly?: boolean }) {
  const markHandled = useMutation(api.cases.markHandled);
  const addNote = useMutation(api.cases.addNote);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(c.verdict === "mismatch");
  // A card that arrives live gets its verdict after first render; open the evidence when it turns into a mismatch.
  useEffect(() => {
    if (c.verdict === "mismatch") setOpen(true);
  }, [c.verdict]);

  const stepIndex = c.replyStatus ? STEPS.length - 1 : STEPS.findIndex((s) => s.key.includes(c.status));
  const done = c.replyStatus === "sent";
  const failed = c.status === "failed" && c.replyStatus !== "failed" && c.replyStatus !== "sent";
  const mismatches = c.evidence.filter((e) => e.applicable && !e.matched);
  const matches = c.evidence.filter((e) => e.applicable && e.matched);

  return (
    <article className={`card ${c.verdict ? `card-${c.verdict}` : ""} ${c.handledAt ? "card-handled" : ""}`}>
      <div className="card-head">
        <div>
          <div className={`chip verdict-${c.verdict ?? "pending"}`}>{failed ? "Something went wrong" : verdictLabel(c.verdict)}</div>
          <h2 className="subject">{c.subject || "(no subject)"}</h2>
          <p className="muted small">
            Quoted sender {c.originalSender.name ? `${c.originalSender.name} · ` : ""}
            <span className="mono">{c.originalSender.address ?? "unknown sender"}</span> · forwarded {fmtDate(c.receivedAt)}
            {c.forwardFormat !== "unknown" ? ` via ${c.forwardFormat === "apple" ? "Apple Mail" : c.forwardFormat === "gmail" ? "Gmail" : "Outlook"}` : ""}
          </p>
        </div>
        <ol className="steps" aria-label="Progress">
          {STEPS.map((s, i) => {
            const stopped = c.replyStatus === "unsent" || c.replyStatus === "failed";
            const state = done || i < stepIndex ? "done" : i === stepIndex && !stopped ? "active" : "todo";
            return (
              <li key={i} className={`step step-${state}`}>
                {s.label(c)}
              </li>
            );
          })}
        </ol>
      </div>

      {c.summary && <p className="summary">{c.summary}</p>}
      {failed && c.error && <p className="error">{c.error}</p>}

      {c.deadlineAt && (
        <p className="deadline">
          Date to know: <strong>{fmtDay(c.deadlineAt)}</strong>
        </p>
      )}

      {c.evidence.length > 0 && (
        <details className="evidence" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            {mismatches.length > 0 ? `${mismatches.length} thing${mismatches.length === 1 ? "" : "s"} didn't match` : `${matches.length} check${matches.length === 1 ? "" : "s"} matched`}
            {c.orgName ? ` · checked against ${orgDomainLabel(c)}` : ""}
            {c.orgCrawledAt ? `, crawled ${fmtDay(c.orgCrawledAt)}` : ""}
          </summary>
          <ul>
            {c.evidence
              .filter((e) => e.applicable)
              .map((e, i) => (
                <li key={i} className={e.matched ? "ev-ok" : e.severity === "hard" ? "ev-bad" : "ev-warn"}>
                  <span className="ev-name">{CHECK_LABELS[e.check] ?? e.check}</span>
                  {e.matched ? (
                    <span className="ev-text">
                      matches {e.officialValue ? <span className="mono">{e.officialValue}</span> : "the official source"}
                    </span>
                  ) : e.check === "payment_method" ? (
                    <span className="ev-text">
                      {e.severity === "soft" ? "mentions " : "asks for payment by "}<span className="claim">{paymentWords(e.claimValue)}</span>{e.severity === "soft" ? "; a payment request could not be confirmed" : ""}
                    </span>
                  ) : (
                    <span className="ev-text">
                      {e.claimValue && <span className="mono claim">{e.claimValue}</span>}
                      {e.officialValue && (
                        <>
                          {" "}≠ <span className="mono">{e.officialValue}</span>
                        </>
                      )}
                    </span>
                  )}
                  {e.quote && (
                    <blockquote>
                      “{e.quote}”{" "}
                      {e.sourceUrl && (
                        <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                          {(() => {
                            try {
                              return new URL(e.sourceUrl).hostname.replace(/^www\./, "");
                            } catch {
                              return "source";
                            }
                          })()}
                        </a>
                      )}
                    </blockquote>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}

      {c.replyText && c.replyStatus && (
        <div className="reply" role="status">
          <p className="eyebrow">{c.replyStatus === "sent" ? `Reply sent ${fmtDate(c.replySentAt)}` : c.replyStatus === "sending" ? "Sending reply…" : c.replyStatus === "failed" ? "Reply failed — draft saved" : "Unsent reply draft"}</p>
          {c.replyError && <p className="muted small">{c.replyError}</p>}
          {c.replyStatus === "sent" && <p className="muted small">Accepted by the email provider. Delivery has not been confirmed.</p>}
          <p>{c.replyText}</p>
        </div>
      )}

      <footer className="card-foot">
        {c.notes.map((n, i) => (
          <p key={i} className="note">
            <strong>{n.by}</strong> {n.text} <span className="muted small">{fmtDate(n.at)}</span>
          </p>
        ))}
        {!readOnly && <form
          className="actions"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim() || saving) return;
            setSaving(true); setError("");
            try { await addNote({ caseId: c._id as Id<"cases">, text: note }); setNote(""); }
            catch { setError("Could not save your note. Your text is still here; try again."); }
            finally { setSaving(false); }
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the family" aria-label="Note" maxLength={500} disabled={saving} />
          <button type="submit" disabled={saving || !note.trim()}>Add note</button>
          {c.handledAt ? (
            <span className="handled">Handled by {c.handledBy}</span>
          ) : (
            <button type="button" className="secondary" disabled={saving} onClick={async () => {
              setSaving(true); setError("");
              try { await markHandled({ caseId: c._id as Id<"cases"> }); }
              catch { setError("Could not mark this case handled. Try again."); }
              finally { setSaving(false); }
            }}>
              Mark handled
            </button>
          )}
        </form>}
        {error && <p role="alert" className="error">{error}</p>}
      </footer>
    </article>
  );
}
