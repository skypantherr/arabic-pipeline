# Bounty lane — verified facts, live shortlist, and the rules of engagement

(22 Oct 2026. Re-pulled from Superteam Earn's public API minutes before writing.)

## What a bounty actually is (Superteam Earn's own FAQ)

> "A bounty is a competitive task, where everyone participating does the work and
> the best submission(s) get rewarded. Consider it as a contest where multiple
> people attempt the same scope of work."

- Sign up on earn.superteam.fun (verify email + make a talent profile) → pick a
  listing → "Submit Now".
- **Submissions cannot be changed after submitting.** So the draft must be
  final before you click.
- **Payout:** external sponsors → straight to the wallet on your Superteam
  account (occasionally they ask for KYC/invoice). Superteam/Solana-sponsored
  listings → KYC + a payment form, paid within 7 days.
- **How winners are picked:** "Typically, sponsors conduct submission/application
  reviews and select the winners. However, in situations where their bandwidth
  is limited, a brain-trust member within Superteam might help evaluate."
  → judging is blind-ish: no follower count, no account age, no fame.
- **Plagiarism policy:** "Some sponsors mandate that submissions with over 15%
  plagiarism will be immediately disqualified, and repeat offenders will be
  permanently barred." Originality matters. (No published platform-wide ban on
  AI-assisted writing was found — but each sponsor sets its own rules, so read
  the brief.)
- `eligibility` questions in the API are per-listing and sometimes mandatory
  (e.g. one listing demands the Luma email you registered with).

## Two myths checked (both matter)

**1. "Threads are for verified/Premium subscribers." — False, and out of date.**
Typefully's help centre, updated 21 July 2026:
> "Non-Premium / Free users: Free Twitter / X users can publish up to **50 posts
> in a thread with up to 280 characters per post**."

Free accounts post threads. 280 characters per post, up to 50 posts. A thread is
a reply-chain (post → reply to yourself → reply to yourself). No Premium, no
verification badge, no card. (The long-form "thread composer" and X Articles are
Premium-only; you don't need them.)

**2. "A 0-follower account won't be accepted." — There is no follower gate.**
Checked the three non-dev listings' full briefs:
- `$CHIMP` thread: `eligibility: []` (no eligibility questions at all).
  Judging: "Depth of research… Clarity… Reasons to join… Creativity… Visuals…
  **Engagement: Likes and reposts count, but quality comes first.**"
- `worm` Premier League: `eligibility: []`. "Main criteria will be based on the
  quality/performance of the post" → "Did you actually explore? … Is it good?
  Sharp, clear, fun to read wins."
- No follower minimum, no account-age minimum, no verification requirement, in
  either brief. Also: X's 2026 algorithm gives small accounts a fair shot.

**Where your concern IS right:** listings judged on *reach* (impressions, reposts)
are hopeless from a cold account — and every reach-judged listing we saw is
already excluded for other reasons (trading/spend). And a *generic AI draft* is
exactly what loses a craft-judged contest with 250 entries. So the user's own
voice, angle and language are the edge — not the draft.

## Live Global shortlist (region=Global only; regional listings are closed to us)

| Listing | Pays | Entries | Deadline | Odds | Verdict |
|---|---|---|---|---|---|
| **$CHIMP thread** (`chimp-on-metaplex`) | 1st $100 · 2nd $75 · 3rd $50 · **4th–25th = $25** | 251 | 14 Nov | **~10%** | **Primary.** Craft-judged, no eligibility gate, 3 weeks of runway, 8+ tweet thread |
| **worm Premier League** (`create-content-on-premier-league-predictions-with-worm`) | 1st $150 · 2nd $75 · 3rd $50 · 4th $25 · **rest = $20** | 103 | 24 Nov | winner count not stated — read the brief | **Secondary.** Needs: follow @wormwtf, connect a wallet at worm.wtf (free), grab the referral link, include it + screenshots, use the word "Predict" (never betting/gambling framing) |
| Vaultline audit grants | 10 × $4,000 | 80 | 31 Oct | — | Needs a Solana project → dev only |
| MultiHopper build | $3,000/$1,250/$750 | 0 | 30 Nov | — | Needs a build + users → dev only |
| Daejin "Launch & Trade" | $200→$70 | 31 | 23 Oct | — | **Excluded** (needs a $5 position + reach judged) |
| Panta × NectarFi | 5 × $100 | 13 | 12 Nov | — | **Excluded** (needs trading ≥$1) |
| La Familia "El Encuentro" | 500/400/300/200/200 + **6th–10th = $80 only** | 253 | 24 Oct | **~4%** | **Excluded** (only 10 winners, Luma signup required, Spanish) |

Expected value: $CHIMP ≈ 10% × $25 = **$2.50 per ~2h entry**. That is the
first-dollar maths. Treat it as a bonus, not a business.

## Rules of engagement for the drafting session

1. **Only `region === "Global"` listings.** The API returns a bare array from
   `GET https://earn.superteam.fun/api/listings/?take=25`; details (region,
   rewards map, full brief, eligibility questions) come from
   `GET https://earn.superteam.fun/api/listings/details/<slug>`.
   In the rewards map, key `"99"` = the flat amount paid to every remaining
   winner — that number decides which listing to enter.
2. **Reject** anything requiring spend, trading, a position, a token purchase,
   a referral-only task, a region lock, or reach-based judging.
3. **Prefer** external sponsors (no KYC), a flat non-winner tier, ≥5 days of
   runway, and craft-based judging.
4. **Also scan the full board** (the API returns ~12 featured; the live board has
   more, including non-promotional briefs and translation work). An
   Arabic-language or MENA-focused brief is the user's genuine edge — flag any
   such listing immediately.
5. **Every draft must be:**
   - the full final copy, paste-ready, meeting every stated constraint (tweet
     count, required tags, links, screenshots, forbidden wording);
   - accompanied by a "what to click, in order" checklist for the user's X
     account;
   - accompanied by the exact Superteam submission text and which URL goes where;
   - accompanied by the odds maths (winners ÷ entries) and the deadline;
   - **flagged with anything the user must verify or rewrite in their own
     words** — a generic AI voice loses craft-judged contests, and the 15%
     plagiarism rule is real. The user adds the personal angle/voice; that is
     the edge, and the reason their Arabic matters.
6. **Never** spend money, post on the user's behalf, or sign in as them.

## Also available (no X account needed, no capital beyond $0.08)

**DeskCrew x402 paid-answer board** — pick a support ticket, write a reply, a
human at the company approves, the wallet keeps 85% of a $0.85–$5 bounty.
Published odds: 82% of $1 rows get a winner, 4.7 entrants/row → ~17% per
attempt, entry cost ~$0.08. **Board was empty on 22 Oct 2026** (lifetime volume
$69.74 across 30 wallets) — check it, don't depend on it. It needs $0.08 of
USDC, which the PayAPI $0.10 canary will provide.

## The honest strategic note

The cold-account/zero-reach problem is a property of **human-judged contests**,
not of the x402 route. In the x402 market the buyer is a program that searches
for a capability — no followers, no account age, no reputation, no audience. That
is why the API lane is the structural answer and the bounty lane is the
short-term cash. They don't compete; run both.
