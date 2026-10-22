# Draft (prepared 22 Oct 2026, ~12h after listing) — DO NOT SEND from the agent

**Status trigger:** wallet `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`
still shows 0 USDC on Base and the listing is not yet in the PayAPI public
index. PayAPI says review is "within 24h", so 12h is not overdue — this draft
is for **if nothing changes after 24h+.** Send from `skypantherr@hotmail.com`,
and only after `npm run check:daily` confirms the wallet is still empty.

---

**To:** support@payapi.market *(placeholder — confirm the address they used in
their confirmation email before sending; the brief did not record it)*
**Subject:** Canary status request — listing "Arabic Pipeline API"

Hi PayAPI team,

Yesterday (22 Oct) I submitted a listing called **Arabic Pipeline API** — a
pay-per-call service for Arabic text, audio and document utilities
(USDC on Base). Your confirmation email said the next step is one paid canary
call (cap $0.10), and that the listing goes live once it passes and shows an
on-chain receipt.

The service side checks out from here: every paid route answers a correct
`402 Payment Required` in under 200 ms against
`https://arabic-pipeline.arabic-pipeline.workers.dev` (network `eip155:8453`,
asset USDC, `extra.name "USD Coin"`, prices $0.002–$0.03, `payTo` = the wallet
on the form), and the same challenge shape comes back from the MCP server. The
payout wallet has not received anything yet, and the listing isn't in your
public index yet — which I understand is normal until the canary passes.

Could you tell me the current status of the canary call for our listing? If it
failed or is queued behind something on our side, I'm happy to fix it quickly.

Thank you!

— [user name]

---

## When NOT to send
- If `npm run check:daily` shows a non-zero USDC balance → the canary fired;
  record the tx hash in `SCOREBOARD.md` instead and skip this email.
- If their confirmation email arrives in the meantime — it supersedes this.
