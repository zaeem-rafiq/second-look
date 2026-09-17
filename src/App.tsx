import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type Board = NonNullable<FunctionReturnType<typeof api.cases.listBoard>>;
type Case = Board["cases"][number];

const STEPS: { key: Case["status"][]; label: (c: Case) => string }[] = [
  { key: ["received"], label: () => "Received" },
  { key: ["extracting"], label: () => "Reading" },
  { key: ["resolving_org", "checking"], label: (c) => (c.orgName ? `Checking ${orgDomainLabel(c)}` : "Checking") },
  { key: ["replying"], label: () => "Verdict" },
  { key: ["replied"], label: () => "Replied" },
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
  sender_domain: "Sender address",
  link_domains: "Links",
  phone: "Phone number",
  policy_contradiction: "What they say vs. official policy",
  urgency_pressure: "Time pressure",
  payment_method: "Payment method",
};

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDay(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const familySlug = params.get("family") ?? "demo";
  const board = useQuery(api.cases.listBoard, { familySlug });

  if (board === undefined) return <main className="shell"><p className="muted">Loading the board…</p></main>;
  if (board === null) return <main className="shell"><h1>Second Look</h1><p className="muted">No family called “{familySlug}” yet.</p></main>;

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Second Look</p>
          <h1>{board.family.name}</h1>
          <p className="muted">
            {board.parents.map((p) => p.name).join(", ") || "No parent yet"} forwards anything confusing to{" "}
            <code>{board.helperAddress ?? "the helper inbox"}</code>. Every forward shows up here, live.
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
            <CaseCard key={c._id} c={c} />
          ))}
        </section>
      )}
    </main>
  );
}

function CaseCard({ c }: { c: Case }) {
  const markHandled = useMutation(api.cases.markHandled);
  const addNote = useMutation(api.cases.addNote);
  const [note, setNote] = useState("");
  const [who, setWho] = useState(() => localStorage.getItem("secondlook.name") ?? "");
  const [open, setOpen] = useState(c.verdict === "mismatch");
  // A card that arrives live gets its verdict after first render; open the evidence when it turns into a mismatch.
  useEffect(() => {
    if (c.verdict === "mismatch") setOpen(true);
  }, [c.verdict]);

  const stepIndex = STEPS.findIndex((s) => s.key.includes(c.status));
  const done = c.status === "replied";
  const failed = c.status === "failed";
  const mismatches = c.evidence.filter((e) => e.applicable && !e.matched);
  const matches = c.evidence.filter((e) => e.applicable && e.matched);

  const name = () => {
    const n = who.trim() || "A family member";
    localStorage.setItem("secondlook.name", n);
    return n;
  };

  return (
    <article className={`card ${c.verdict ? `card-${c.verdict}` : ""} ${c.handledAt ? "card-handled" : ""}`}>
      <div className="card-head">
        <div>
          <div className={`chip verdict-${c.verdict ?? "pending"}`}>{failed ? "Something went wrong" : verdictLabel(c.verdict)}</div>
          <h2 className="subject">{c.subject || "(no subject)"}</h2>
          <p className="muted small">
            From {c.originalSender.name ? `${c.originalSender.name} · ` : ""}
            <span className="mono">{c.originalSender.address ?? "unknown sender"}</span> · forwarded {fmtDate(c.receivedAt)}
            {c.forwardFormat !== "unknown" ? ` via ${c.forwardFormat === "apple" ? "Apple Mail" : c.forwardFormat === "gmail" ? "Gmail" : "Outlook"}` : ""}
          </p>
        </div>
        <ol className="steps" aria-label="Progress">
          {STEPS.map((s, i) => {
            const state = done || i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
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

      {c.replyText && (
        <div className="reply">
          <p className="eyebrow">Reply sent {fmtDate(c.replySentAt)}</p>
          <p>{c.replyText}</p>
        </div>
      )}

      <footer className="card-foot">
        {c.notes.map((n, i) => (
          <p key={i} className="note">
            <strong>{n.by}</strong> {n.text} <span className="muted small">{fmtDate(n.at)}</span>
          </p>
        ))}
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            void addNote({ caseId: c._id as Id<"cases">, by: name(), text: note });
            setNote("");
          }}
        >
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Your name" aria-label="Your name" className="who" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the family" aria-label="Note" />
          <button type="submit">Add note</button>
          {c.handledAt ? (
            <span className="handled">Handled by {c.handledBy}</span>
          ) : (
            <button type="button" className="secondary" onClick={() => void markHandled({ caseId: c._id as Id<"cases">, by: name() })}>
              Mark handled
            </button>
          )}
        </form>
      </footer>
    </article>
  );
}
