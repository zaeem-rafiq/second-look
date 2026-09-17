import { v } from "convex/values";
import { zodTextFormat } from "openai/helpers/zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
  buildModelInput,
  deterministicExtract,
  mergeExtraction,
  parseForwardedEmail,
  type LlmExtraction,
} from "../lib/extract";
import { htmlToText } from "../lib/forwardParser";
import { normalizePhone } from "../lib/phones";
import { EXTRACT_MODEL, openaiClient, openaiConfigured } from "./clients/openai";
import { getMessage, type MessageReceivedEvent } from "./clients/agentmail";

/**
 * Extract facts from the forwarded email. Code recovers identity facts (original
 * sender, links, phones); the model adds semantics when a key is configured.
 */
export const extractCase = internalAction({
  args: { caseId: v.id("cases"), inboxId: v.string(), needsFetch: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { case: c } = await ctx.runQuery(internal.cases.getForPipeline, { caseId: args.caseId });
    const blob = await ctx.storage.get(c.rawStorageId);
    if (!blob) throw new Error("raw delivery missing from storage");
    const event = JSON.parse(await blob.text()) as MessageReceivedEvent;
    let { text = "", html = "" } = event.message;
    if (args.needsFetch || (!text && !html)) {
      const full = await getMessage(args.inboxId, c.agentmailMessageId);
      text = full.text ?? "";
      html = full.html ?? "";
    }

    const orgs = await ctx.runQuery(internal.registry.listAliases, {});
    const parsed = parseForwardedEmail(text, html);
    const det = deterministicExtract(parsed, text, html, orgs);

    let llm: LlmExtraction | null = null;
    if (openaiConfigured()) {
      try {
        const response = await openaiClient().responses.parse({
          model: EXTRACT_MODEL,
          reasoning: { effort: "none" },
          input: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: buildModelInput(parsed, text, html) },
          ],
          text: { format: zodTextFormat(ExtractionSchema, "email_extraction") },
        });
        if (response.status === "incomplete") {
          console.warn("extraction incomplete", response.incomplete_details?.reason);
        } else {
          llm = response.output_parsed ?? null;
        }
      } catch (err) {
        // The deterministic extraction still stands; the verdict never depends on the model.
        console.error("openai extraction failed; using deterministic extraction only", String(err));
      }
    }

    // Experiment behind a flag (off unless PAYMENT_GATE_MODE is set): TypeSafe Jev answers the
    // payment-method gate, falling back to the LLM answer when Jev is not confident.
    const gateMode = process.env.PAYMENT_GATE_MODE;
    if (llm && (gateMode === "jev_shadow" || gateMode === "jev_cascade")) {
      const [{ applyPaymentGateFlag }, { gateEmailFromParsed }] = await Promise.all([
        import("../lib/paymentGateClient"),
        import("../lib/paymentGate"),
      ]);
      llm = await applyPaymentGateFlag(gateMode, llm, gateEmailFromParsed(parsed, text || htmlToText(html)));
    }

    const merged = mergeExtraction(det, llm, normalizePhone);
    await ctx.runMutation(internal.cases.setExtracted, { caseId: args.caseId, extracted: merged, forwardFormat: parsed.format });
    return null;
  },
});
