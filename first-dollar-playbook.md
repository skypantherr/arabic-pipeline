# Getting your first $1–$100 online from the West Bank (research, Oct 2026)

> **UPDATED 22 Oct 2026 — see `crevices.md` first.** This document is the
> "platform" analysis (which platforms pay, which are closed to Palestinians) and
> its facts still stand. `crevices.md` reframes the answer around structural gaps
> (the x402 paid-answer market, the fiat⇄crypto corridor) and contains
> **corrections** to this file — notably that Binance P2P has no Palestinian
> bank or ILS rail, and that the Daejin bounty needs a $5 position.

Prepared from live web research, 22 Oct 2026. Every claim is tagged:
**[VERIFIED]** = confirmed on an official/primary source (linked),
**[THIRD-PARTY]** = from a non-official source (affiliate/aggregator/news),
**[UNCERTAIN]** = plausible but not confirmed, or changed since I checked.

---

## 0. Bottom line

Your constraints (no spend, no employment, no client work, no surveys/microtasks, no
trading, no audience) leave **exactly one surviving family of methods: *bounties and
contest prizes that pay in cryptocurrency directly to a wallet*.**

Why: every traditional rail is closed to you, and the only things left that don't
require a job, a client, an audience, a card, or a deposit are *bounty boards*.
The crypto part isn't a hack — it's simply the only payment network that will
pay a Palestinian individual a small amount without a bank in a rich country,
without PayPal, and without an employer's payroll system.

Two things decide whether you actually get paid:

1. **Get paid to a self-custody wallet, not to an exchange account.** Your Trust
   Wallet is the right instrument. Skip custodial exchanges — see §5.
2. **Pick the bounty family that matches what you can actually do** (writing vs.
   code). The payout rails are identical; the work is what differs.

**My single strongest recommendation, in order of realistic probability of a first
dollar:**

| Rank | Route | Skill | Realistic first dollar | Payout rail |
|---|---|---|---|---|
| 1 | **Superteam Earn "Global" content bounties** (external-sponsor listings) | writing, English, an X account | **1–3 weeks**, $20–$100 per win | USDC → Trust Wallet (Solana) |
| 2 | **HackenProof** crypto bug bounty (web/app programs) | web/mobile testing | 2–8 weeks, $100+ per finding | USDC (Base) → Trust Wallet |
| 3 | **HackerOne** (crypto payout option) | web/mobile testing | 2–8 weeks, $15+ per finding | USDC/BTC → Trust Wallet |
| 4 | Immunefi / Code4rena | Solidity auditing | 1–3 months, $1k+ | USDC → wallet |

**Honest answer to "can I get a dollar in 24 hours?"** — I could not verify any
method that does that for you at $0 cost. Everything that pays fast either needs
a deposit (exchange sign-up bonuses, which are also trade-gated), is a
survey/microtask/quiz (you excluded those), is a referral play (needs an
audience), or is a prediction-market task that requires you to *trade* (you
excluded that). The fastest honest number I can give you is **~1–3 weeks for
route 1**, and the per-entry odds on a typical route-1 bounty are around
**10%** (25 of 250 entries currently paid a $25 tier) — see §2.1.

---

## 1. The rail map: what can and cannot pay you

### 1.1 Confirmed dead (do not waste time)

| Rail | Status | Source |
|---|---|---|
| **PayPal** | "does not serve Palestinians in Gaza and the West Bank" | Atlantic Council (Sept 2026), via worknet.community **[VERIFIED]** |
| **Payoneer** | Excludes Palestinians in Gaza and West Bank; also mass account freezes 2024 | The Canary (May 2026) citing a new report; Novara Media (Jan 2024) **[THIRD-PARTY / multiple]** |
| **Wise** | Not a supported country; documented freezes of Palestinian accounts | wise.com/help (supported lists); Novara Media **[VERIFIED + THIRD-PARTY]** |
| **Stripe** | "Palestine State" appears on lists of countries *not* supported by Stripe Connect | Fourthwall KB (Aug 2026) listing Stripe's non-supported set; The Canary **[VERIFIED via KB]** |
| **Revolut / Remote / Contra** | Revolut excludes Palestinians; Remote & Contra (stablecoin contractors) are employment/client work anyway | The Canary; remote.com support page **[THIRD-PARTY]** |
| **Bybit fiat/P2P** | Bybit's own "List of Restricted Issuing Countries for Fiat Service" **explicitly includes "Palestine (State of)" and "West Bank (Palestinian Territory)"** | bybit.com help centre **[VERIFIED]** |
| **Binance** | Not on Binance's own app-availability country list (that list runs Palau → Panama with no Palestine entry); multiple third-party country guides list it as usable in Palestine; **and there are documented cases of Binance freezing/seizing funds of Palestinian users at the IDF's request** | binance.com/en/support-region-list (indexed); uabonline + Anadolu Agency reports; cexfinder **[VERIFIED (absence) + THIRD-PARTY]** |

> I could not load Binance's own legal pages in a browser (they returned an empty
> shell), so treat Binance's exact status for Palestinian residents as
> **[UNCERTAIN]**. That uncertainty, plus the documented seizure risk, is reason
> enough not to route your money through a Binance custodial balance.
>
> **Key architectural insight:** every route in §2 pays **your wallet**, not an
> exchange account. So you never need a Binance/Bybit/KuCoin account, never need
> a card, and never need a US bank. You only need Trust Wallet.

### 1.2 What you already have that works

- **Trust Wallet (self-custody).** Supports 100+ chains — Ethereum, BSC, Arbitrum,
  Base, Solana, TRON, TON — and USDC/USDT/DAI/USDA on Ethereum, BSC, Arbitrum
  and Base. trustwallet.com **[VERIFIED]**
  ⚠️ **Network mismatch = permanent loss.** USDC-on-Ethereum, USDC-on-Base and
  USDC-on-Solana are different tokens. Copy the exact address + network the
  payer specifies.
- **Bank of Palestine USD account.** IBAN shown on bop.ps as Local `1700-150-150`
  / Int `0097022946420`; SWIFT/BIC `PALSPS22` (head office, Ramallah), also
  `PALSPS22XXX` for international wires. bankofpalestine.com + SWIFT registries
  **[VERIFIED]**
- **A card?** Palestinian banking operates Visa/Mastercard locally (The Canary,
  May 2026 **[THIRD-PARTY]**). If you have a BOP Visa/Mastercard *debit* card
  with a $0 balance, that unlocks free-tier sign-ups (cloud, AI APIs) that would
  otherwise be dead ends. It costs nothing to check.

---

## 2. The three routes, with real terms

### 2.1 Route 1 — Superteam Earn "Global" content/design bounties (no code)

**What it is.** The Solana ecosystem's gig/bounty board: 242k+ members, 2.7k+
sponsors, 0% commission. Listings are "bounties" (contest, prize pool) vs
"projects" (paid gig, i.e. client work — **excluded by your rules**). Filter the
board by **REGION = Global**; regional chapters (Nigeria, India, Germany,
Netherlands, Balkan…) are closed to you.

**Payout mechanics [VERIFIED — docs.superteam.fun FAQ + live API 22 Oct 2026]:**
- **External-sponsor listings** (e.g. sponsored by a token company): reward goes
  **to the wallet linked to your account**; the sponsor *may* ask for its own
  KYC. → **This is your no-KYC path. Prefer external-sponsor listings.**
- **Superteam/Solana-sponsored listings**: winner completes **KYC + a payment
  form**, reward expected **within 7 days** of submitting the form.
- No minimum payout. Payout token is listed per listing: **USDC** (fine) or
  **USDG** (Global Dollar — *not* natively in Trust Wallet; you'd swap it).
  Listing token: superteam.fun/earn/bounties.

**Live example, open to you right now (fetched from their public API today):**

> **"Write a thread on $CHIMP Fair Launch – Part 1"**
> Sponsor: ChimpX (external, not Superteam) · Region: **Global** · Token: **USDC**
> Pool **$500** · Rewards: 1st $100, 2nd $75, 3rd $50, **and every place from 4th
> to 25th = $25 each** ("Winners: Top 25") · **250 submissions so far** ·
> Deadline 14 Nov 2026 · Skill tag: Content / Writing / Social Media
> **Judging: "Depth of research, clarity, honest reasons, creativity, visuals."
> "Likes and reposts count, but quality comes first."**
> Do: write an 8+ tweet thread covering ≥3 of 7 specific points, tag
> @chimpxai/@solana/@Raydium, include the token + official sale link, submit
> the thread URL on the listing page.

Read the judging criteria: **quality-first, not audience-first** — this is the
one family of crypto content bounties that does *not* secretly require a
following. Realistic per-entry probability ≈ 25/250 ≈ **10%**, and it falls as
more entries arrive before 14 Nov. Payout if you land in the top 25: **$25** —
which is precisely your target.

Other Global listings live today (from the same API pull), with their current
competition, so you can pick by odds:
- "Create Content on Premier League Predictions with worm" — $500 pool,
  $150/$75/$50/$25 then **$20 for everyone else**; 103 submissions; deadline
  24 Nov. ⚠️ Requires posting on X **with your worm referral link** and
  screenshots; judged partly on post *performance* → effectively audience-biased.
  Use only if you're willing to promote a prediction-market product.
- "MultiHopper Build & Route Challenge" — $5,000 pool, 3 winners, **0
  submissions**, deadline 30 Nov, Global. Dev/building + "bring it real users" →
  audience component.
- "Vaultline Security Audit Grants" — 10 × $4,000, Global, 80 submissions, code
  audits for Colosseum projects.
- ❌ Excluded by your rules: "Panta × NectarFi" (requires trading ≥$1),
  "Daejin Launch & Trade" (requires taking a position), "Bring Your Friends to
  Segmento" (referral), "Colosseum: talk to 5 users" (network/audience),
  "Travel boost Breakpoint" (Germany-only + travel), India/Netherlands/Balkan
  listings (region-locked).

**What it costs you:** an X account (free), ~2 hours per entry, and the risk of
being one of 250 entries. **What it pays:** $20–$100 USDC to your wallet.

**Also on this board:** a documented **agent API** (superteam.fun/skill.md) for
AI agents, but a *human* must claim and take the payout, and the listings live
today are marked `HUMAN_ONLY`. Ignore it unless you already script.

### 2.2 Route 2 — HackenProof (crypto-native bug bounty, lowest-friction)

**[VERIFIED — docs.hackenproof.com + hackenproof.com/programs + T&C PDF]**
- Rewards are **accrued in USDC**; "in 95% of cases you receive payments …
  as USDC (network **Base**)" to your HackenProof account, then you withdraw to
  your own wallet.
- **Minimum withdrawal: 100 USDC.** Payouts processed "no more than **48
  business hours**". 2FA required. A withdrawal fee may apply and is shown at
  confirmation. Smart-contract addresses are not supported. Total earnings over
  $5,000 may trigger extra verification; contract-based/invoice payments are
  Ethereum-only.
- **KYC is NOT generally required**: only for EU tax residents, when the company
  requests it to credit a reward, or for restricted/private programs.
  → **No ID gate, no tax-form gate, no country gate.** This is the lowest-
  friction crypto-paying bounty platform I found.
- Live programs include **web/app** (CEX front-ends) as well as Solidity:
  e.g. "Ult: Trade Stocks & Crypto" (up to $2,000), "Hotcoin Web & Mobile",
  "Phemex Web & Mobile" (up to $500,000, $16,050 paid out so far), "Starknet Web
  & SC", "Arcadia" (on Base/Optimism, $1,250 paid).
  Web/app scopes (browser + mobile testing) are far more accessible than
  smart-contract auditing. Because the withdrawal floor is exactly 100 USDC, a
  single accepted $100–$500 finding = instant payout.
- Fee note: the T&C says a withdrawal commission applies to requests from
  1 Mar 2026 (amount not published in the snippet I could read — **[UNCERTAIN]**;
  it is displayed in the UI at confirmation).

### 2.3 Route 3 — HackerOne with the crypto payout option

**[VERIFIED — docs.hackerone.com/en/articles/8395720-payment-preferences, and
hackerone.com/security updated 16 Oct 2026]**
- Payout methods: PayPal · Bank transfer (Currencycloud) · **"Direct-to-wallet
  crypto payments: the bounty amount goes to any wallet set up to receive BTC or
  USDC"**.
  - **USDC is sent on the Ethereum network (ERC-20).** Minimum **$15**. Processed
    **daily at 11pm UTC**, payout time 1–2 days. BTC: Legacy and BECH32.
  - Bank transfer alternative: SWIFT min **$100**, local min $50; USD supports
    SWIFT & local; ILS is SWIFT-only and there is **no Palestinian currency
    option**; it warns to check OFAC's sanctions list. [so the wallet route is
    the practical one for you]
- **Three gates before you can be paid [VERIFIED]:** (1) **identity verification
  via Veriff, valid 12 months**; (2) at least one valid payment method;
  (3) **a completed and approved tax form** (W-8BEN for non-US persons; renewed
  every 3 years; name must match your ID).
  - **Veriff supports "Palestine (State of)"** (veriff.com/supported-countries)
    and Arabic-script documents. ⇒ A Palestinian ID card ("Hawiyya") or passport
    is usable. **[VERIFIED]**
  - From 1–14 Aug 2026, HackerOne made ID verification **mandatory for all
    researchers submitting to paid programs**. **[THIRD-PARTY: byteiota,
    worldcybernews, cyberpress]** — treat as true.
  - ⚠️ **Do not use a VPN during the Veriff session** — it triggers automatic
    rejection. Use a physical ID document, not a digital copy.
- Realistic bounty sizes on the platform: **Low severity avg $173** ($100–200),
  Medium $1,500, High $7,000, Critical $15,000. Several programs advertise a
  **"$50 minimum bounty"** (e.g. Brave Software, TRON DAO, Compass).
- ⚠️ Honest timeline: industry commentary for a complete beginner is
  **"expect 20–50 hours before your first payout"** (some get lucky in 5). The
  platform itself warns in Dec 2025 that it **cut rewards** (HackerOne's own
  baseline bounty fell from $597 → $68 for low severity), i.e. the pie is
  smaller than a year ago. **[THIRD-PARTY: The Register, May 2026]**

### 2.4 Route 4 (if you can write Solidity) — bigger money, longer fuse

- **Immunefi** — 169 live programs, USDC/ETH/project tokens, median confirmed
  payout ~$2,000; KYC above certain thresholds and some programs require KYC
  for all participants. **[VERIFIED via immunefi.com/bug-bounty + a Sherlock
  write-up]**
- **Code4rena** — USDC, no stake, weekly contests, competitive format. **[VERIFIED]**
- ❌ **Sherlock** — requires a **$250 USDC stake per submission** (refunded only
  if the finding is valid) → violates your "no upfront spending" rule. **[VERIFIED]**
- **Hats Finance** — permissionless, no KYC. **[VERIFIED]**

### 2.5 Dead bounty platforms I checked and ruled out (so you don't)

- **Algora** (the biggest OSS bounty board): pays **via Stripe Connect** → dead
  for you. **[VERIFIED — Stripe dependency, confirmed by Algora's own setup docs
  and an agent-earning guide]**
- **Opire**: OSS.Fund lists payment method as **Stripe**; a DEV article claims
  "crypto or Stripe". **Conflicting sources → [UNCERTAIN].** Only trust it if you
  see a crypto option in your own dashboard.
- **OnlyDust**: the platform's own manifesto now reads *"The OnlyDust chapter
  closes here"* — it is winding down into a different product. **[VERIFIED from
  onlydust.com]**
- **Topcoder**: stopped paying via PayPal/Payoneer on 21 Oct 2025, now pays via
  **Trolley (bank transfer)**; contests are skill-gated anyway. **[VERIFIED]**
- **Bountycaster**: Farcaster-based, USDC/ETH/OP/DEGEN, $20–$100 design tasks, but
  P2P payments (counterparty trust) and posting privileges gated behind a
  Farcaster badge. **[VERIFIED, but low conviction]**
- **Lightning Bounties**: site is live and pays sats over Lightning for merged
  PRs, but the public "Open Bounties" inventory renders as placeholder names
  (Ninja1st, Ursula, Thor) — **I could not verify any live funded bounty.**
  **[UNCERTAIN — check before investing time]**
- **Honeygain (bandwidth sharing)**: minimum payout **$20**, PayPal-only
  (PayPal is a dead rail for you) or via JumpTask; flat **$0.10/GB** with a
  **15 GB/month free-tier cap ≈ $1.50/month**. Dead. **[VERIFIED]**
- **Packet Storm** (Windscribe's bandwidth/research payer): **packetstorm.net is
  now a parked domain for sale.** Dead. **[VERIFIED]**
- **Exchange sign-up bonuses** (MEXC, KuCoin, Bybit, Binance, Gate, Bitget):
  every real cash bonus is **deposit- or trade-gated** (e.g. Bybit "$20 USDT spot
  airdrop when you trade your first $100"; MEXC "10 USDT voucher" usable only on
  **futures** fees). Excluded by your rules and worthless without capital.
  **[THIRD-PARTY + verified against cexfinder promo list]**
- **Airdrops / quests / Learn-and-Earn quizzes / faucets**: mostly $0, sybil-
  filtered, and (for quizzes/faucets) inside the survey/microtask bucket you
  excluded. Listed here only to close them out.

---

## 3. Turning $1–$100 of crypto into spendable money (verified off-ramp)

**ATM24 (atm24.pro) — the concrete West Bank off-ramp.** Their live Ramallah page
(checked today) shows:
- **Accepted crypto in:** USDT — TRC-20, ERC-20, BEP20 · **USDC — ERC-20** ·
  USD cash · USD bank transfer · EUR · RUB …
- **Payout out:** **cash pickup** at listed Ramallah money changers (TURMUS'AYYA
  MONEY CHANGER PLC — Ramallah, ALBIREH Shopping Center; AL ABDEEN EXCHANGE —
  beside QUDS BANK HQ) **or transfer to a local bank account**.
- For a **PS-format IBAN** payout they ask for: **IBAN + bank SWIFT code +
  recipient name in Latin characters** — i.e. exactly your BOP account.
- Rate today: **1 USDT = 2.93 ILS** vs. mid-market **≈3.05 ILS/USD** (OFX/Wise/
  MTFX mid-Oct 2026) → **~4% spread**, plus commission "starting from 0.9%".
  **[VERIFIED]**
- Practical note: ATM24 quotes USDT ≈ USD ≈ 2.93 ILS, so **the spread is small
  if you convert straight to ILS**; if you insist on *USD* into your BOP USD
  account, you eat ILS→USD conversion twice. Ask them for the USD route (IBAN +
  SWIFT PALSPS22) on WhatsApp before sending anything.

**Chain that works end-to-end, no exchange account needed:**
`HackerOne USDC (ERC-20)` → **direct** → `ATM24 (USDC ERC-20 input)` → cash ILS
or USD via BOP. (HackenProof pays **USDC on Base**; you'd need one small
cross-chain swap to ERC-20 in Trust Wallet, which costs a little ETH gas —
receive first, swap later.)

**Alternatives if ATM24 doesn't suit you:** the local exchange shops in Ramallah
/ Nablus / Hebron / Jenin (they're the ATM24 payout points and they handle
cash), and Telegram/P2P groups (higher rate but counterparty risk and no
recourse — don't do your first trade there).

---

## 4. Reinvesting the $1–$100 without a card

Since your money will be crypto, spend it where crypto is accepted:
- **Namecheap** — accepts crypto (BTC via BTCpay/BitPay), **minimum crypto
  deposit $1**, funds usable for domains/hosting. A cheap TLD (e.g. .xyz/.top)
  is $1–2/yr; .com is ~$10–15/yr. namecheap.com KB **[VERIFIED]**
- **Hostinger** — crypto via **CoinGate** (Bitcoin, Ethereum, Litecoin, USDT,
  BNB, Dogecoin, Solana…), plans from ~$2.99/mo. **[THIRD-PARTY list, multiple
  consistent sources]**
- **Vultr** — crypto via **BitPay**, VPS from ~$2.50–3.50/mo. **[THIRD-PARTY]**
- **Cloudflare Pages/Workers** — free tier, no card.
Practical order: a domain you can point anywhere (~$1–3) + a cheap VPS only once
you have a reason to; keep the rest in USDT/USDC until you have a next step.

---

## 5. Why I am steering you away from crypto exchanges entirely

1. **Bybit explicitly lists Palestine and "West Bank (Palestinian Territory)" in
   its restricted-issuing-countries list for fiat services.** **[VERIFIED]**
2. **Binance has been reported to seize/freeze funds of Palestinian users at
   the IDF's request**, with appeals denied. **[THIRD-PARTY: UAB, Anadolu
   Agency]** Even if registration works, a custodial balance is a legal
   counterparty risk, not just a technical one.
3. **Palestinian banks have been scrutinising incoming transfers** and asking
   for proof of service, source of funds and purpose since Aug 2026; a P2P
   stranger's wire is the worst possible source-of-funds story. **[THIRD-PARTY:
   Al Jazeera Arabic, Aug 2026]**
4. Everything you need is on a **self-custody wallet**. Trust Wallet is free,
   needs no bank link, and pays no platform fee for receiving. Keep the
   mnemonic offline; use a separate receive address per payout source so you
   can reconcile.

---

## 6. A concrete first 7 days

**Day 0 (30 min).** In Trust Wallet, create/save four receive addresses and
label them: **USDC (Ethereum)**, **USDC (Base)**, **USDC (Solana)**, **USDT
(TRC-20)**. Confirm your BOP IBAN + SWIFT `PALSPS22` are written down.
Do **not** need any money for any of this.

**Day 1 (1 h).** Open superteam.fun/earn → sign up with email → link a Solana
wallet → set **Region = Global** → filter **Content**. Read the FAQ so you know
KYC only comes up for Superteam-sponsored listings. Target listings that are
(a) Global, (b) sponsored by an external company, (c) **judged on craft not
engagement**, (d) with a "Top N" or flat tier for non-winners, (e) with a
low submission count.

**Day 2–4 (2 h/entry × 2–3 entries).** Write and submit. Use the free product
the bounty is about (so your "depth of research" is real). Post publicly, tag as
required, submit the public URL. Keep a spreadsheet: listing, submission count
at entry, deadline, URL.

**In parallel, if you can do any technical testing** (browser/mobile/devtools):
- **HackerOne**: create account → accept Rules of Engagement → Veriff ID with
  your physical Hawiyya ID or passport (**no VPN**) → sign W-8BEN → set payout
  method = USDC Wallet (Ethereum address) → aim at programs advertising a
  **$50 minimum** and fast triage (Brave, TRON DAO, Compass, CoinSpot).
- **HackenProof**: create account → add Base USDC wallet → enable 2FA → pick a
  **web/app** program (Ult, Hotcoin) where one accepted finding clears the
  100 USDC floor.

**Day 5–7.** Check for winners; if nothing, enter one more listing. When USDC
lands: keep it in the wallet (reinvest per §4) or convert via ATM24 (§3).

**Success metric:** one paid entry. One $25 payout is a working proof that the
loop functions end-to-end, and it's the fastest possible way to learn what a
repeatable version of this looks like.

---

## 7. Facts vs. assumptions (read this before betting on it)

**Solid (official sources):** HackerOne's crypto payout terms and its three
payment gates; Veriff's support for Palestine; HackenProof's USDC/Base/100-USDC/
48-hour/mostly-no-KYC terms; Immunefi/Code4rena/Sherlock basics; Superteam
Earn's payout rules and every listing detail quoted above (pulled from their
live public API today); ATM24's routes, rates and payout points; Namecheap's
$1 crypto deposit; BOP's IBAN/SWIFT; Trust Wallet's chains; Bybit's Palestine
fiat restriction; PayPal/Payoneer/Stripe/Wise exclusion of Palestinians.

**Assumption / moderate confidence:**
- That **Palestine is not an officially supported Binance region** (the list
  simply omits it; I could not load Binance's live legal pages) — and my
  *recommendation* not to use Binance rests on the seizure reports, which are
  reported, not officially confirmed.
- That a W-8BEN without a foreign tax ID is acceptable to HackerOne (the form
  allows "N/A", but HackerOne's approval is not something I can confirm).
- Exact Superteam listing inventory changes hourly; the specific deadlines and
  submission counts above are a 22 Oct 2026 snapshot.
- My 10%-per-entry odds for the CHIMP bounty are arithmetic from today's
  250 submissions vs. 25 paid places — they will fall before 14 Nov.

**Explicitly could not verify:**
- Any live, funded bounty on Lightning Bounties.
- Opire's crypto payout option (sources conflict).
- Whether Superteam's KYC vendor accepts Palestinian documents (doesn't matter
  if you stick to external-sponsor listings).
- Whether Bank of Palestine will accept a USD wire from an individual P2P
  counterparty (I recommend not doing that; use ATM24, which sends a compliant
  commercial payment).
- Any method that pays a Palestinian a guaranteed $1 within 24 hours at $0 cost.
  **I could not find one. I am not going to pretend otherwise.**

---

## 8. One-line summary

> Skip every platform that needs a card, a deposit, a trade, a survey, a client,
> or a following. Get a Trust Wallet, open Superteam Earn filtered to **Global**
> + **Content**, and enter 2–3 external-sponsor writing bounties in your first
> week (a live one today pays **$25** to everyone in the top 25 of ~250
> entries, judged on writing quality rather than follower count) — payout is
> **USDC straight to your wallet** with no KYC for external-sponsor listings.
> If you can do technical testing, run HackerOne (USDC to wallet, $15 floor,
> Veriff accepts a Palestinian ID) and HackenProof (USDC on Base, no KYC in
> most cases, $100 floor) *in parallel*. When the money lands, either spend it
> straight (Namecheap accepts crypto from a $1 deposit; Hostinger and Vultr take
> crypto) or cash it via ATM24 in Ramallah/Nablus/Hebron/Jenin (USDT/USDC in,
> cash ILS or a bank transfer out, ~4% spread).

**Sources (primary where possible):** docs.hackerone.com/en/articles/8395720 and
8395744; hackerone.com/security; veriff.com/supported-countries;
docs.hackenproof.com/dashboard/hacker-dashboard/{withdraw-bounty,kyc,create-a-crypto-wallet};
hackenproof.com/programs; hackenproof T&C PDF; immunefi.com/bug-bounty;
sherlock.xyz/post/best-web3-bug-bounties-in-2026; docs.superteam.fun
(Superteam Earn FAQ); superteam.fun/skill.md; superteam.fun/earn/bounties +
earn.superteam.fun/api/listings (live, 22 Oct 2026); bybit.com help centre
(Restricted Issuing Countries); binance.com/en/support-region-list;
atm24.pro/en/palestine/ramallah; bankofpalestine.com/en/personal/transfers;
bop.ps/en/about/correspondents; trustwallet.com; namecheap.com/support;
usdc.com/learn/send-usdc-to-trust-wallet; worknet.community
(Getting Paid in War Zones, 2026); Atlantic Council (Sept 2026);
Al Jazeera (Aug 2026, bank scrutiny); Novara Media (Jan 2024);
The Canary (May 2026); Jewish Currents (Nov 2025); The Register (May 2026).
