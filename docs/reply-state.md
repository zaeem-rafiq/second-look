# Reply state and recovery

The board separates the case verdict from email sending:

- `unsent`: the stable draft exists; no AgentMail credential is configured. No provider ID or sent timestamp is recorded.
- `sending`: one worker owns a 60-second lease. Each provider request has a 20-second timeout; at most one threading fallback is allowed per attempt.
- `sent`: AgentMail returned nonempty message and thread IDs, and acceptance was stored. This does **not** establish delivery.
- `failed`: sending or local validation did not complete, or the lease expired. The stable draft remains available for retry.

Missing credentials finish the workflow with an unsent draft. Correcting configuration alone does not send it. An authorized operator can rerun the internal `reply:sendReply` action with the existing case and inbox IDs. That action can send real email and requires the separate email authorization applicable to the environment. No live retry or configuration change was performed for HAC-68.

Historical `dry-run:not-sent` rows are displayed as unsent immediately. Retrying clears their fake provider ID and timestamp while retaining their original draft. No bulk data mutation is required.

Retries use the first saved draft and `reply-<caseId>` key. If AgentMail explicitly rejects threading headers with 400/422, the unthreaded choice is stored **before** sending under `reply-plain-<caseId>`; subsequent retries keep that choice. A concurrent worker cannot claim an active send. Late failure/lease callbacks cannot overwrite recorded acceptance. Unconfirmed sends stop retrying 23 hours after the first attempt, leaving an hour of margin before provider keys expire; an operator must reconcile provider acceptance before any further send.

The regression replaces `fetch` entirely and removes provider credentials. It proves the application contract and a synthetic provider's idempotency behavior; no live email was sent. [AgentMail documents idempotent sends](https://docs.agentmail.to/idempotency): the same key returns the original message/thread IDs without another email; changed content, inbox, or endpoint returns 409; keys expire 24 hours after completion. Production behavior was not live-tested here. No delivered claim is shown without independent delivery evidence.

Run the focused regression:

```sh
npm test -- convex/reply.test.ts
```

Before the fix, the missing-credentials regression failed because `replyMessageId` was `dry-run:not-sent` instead of absent. The suite also covers credential recovery, historical rows, interrupted sends, concurrent attempts, ambiguous acceptance, threading fallback recovery, malformed provider responses, invalid recipients, and invalid saved reply content.
