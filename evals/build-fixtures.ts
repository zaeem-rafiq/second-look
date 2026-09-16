// Writes evals/fixtures/*.eml (RFC 5322, multipart/alternative) from the fixture definitions.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, PARENT } from "./fixtures/index";

const HELPER = "helper@example.agentmail.to";
const dir = join(process.cwd(), "evals", "fixtures");
mkdirSync(dir, { recursive: true });

function toEml(f: (typeof FIXTURES)[number]): string {
  const boundary = `----=_Part_${f.id.replace(/[^a-z0-9]/gi, "")}`;
  const date = "Tue, 15 Sep 2026 09:20:11 -0400";
  const lines = [
    `From: ${PARENT.name} <${PARENT.address}>`,
    `To: <${HELPER}>`,
    `Subject: ${f.subject}`,
    `Date: ${date}`,
    `Message-ID: <${f.id}@example.com>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    f.text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    f.html,
    ``,
    `--${boundary}--`,
    ``,
  ];
  return lines.join("\r\n");
}

for (const f of FIXTURES) {
  writeFileSync(join(dir, `${f.id}.eml`), toEml(f));
}
console.log(`wrote ${FIXTURES.length} fixtures to evals/fixtures/`);
