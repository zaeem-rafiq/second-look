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

    const merged = mergeExtraction(det, llm, normalizePhone);
    await ctx.runMutation(internal.cases.setExtracted, { caseId: args.caseId, extracted: merged, forwardFormat: parsed.format });
    return null;
  },
});
