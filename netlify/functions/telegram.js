// Telegram "I Declare War" — 3 or 5 players, 10 cards each.
// Commands: /start, /war3, /war5
exports.handler = async (event) => {
  // ✅ Add this so opening the URL in a browser shows a message
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "Warchester bot is live. Webhook expects POST from Telegram." };
  }
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: "Missing TELEGRAM_BOT_TOKEN" };

    const update = JSON.parse(event.body || "{}");
    const msg = update.message || update.edited_message;
    if (!msg) return ok();

    const chat_id = msg.chat.id;
    const text = (msg.text || "").trim();

    const api = (method, payload) =>
      fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

    if (!text || text.startsWith("/start")) {
      await api("sendMessage", {
        chat_id,
        text:
`🏰 *Warchester — I Declare War*
Use:
/war3 — 3 players, 10-card match
/war5 — 5 players, 10-card match

Rules: Each round, highest card wins the trick (A high).
Tie = WAR: tied players burn one card and flip the next until someone wins.`,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });
      return ok();
    }

    if (text.startsWith("/war3") || text.startsWith("/war5")) {
      const players = text.startsWith("/war3") ? 3 : 5;
      const result = playWar(players, 10);
      const msgText = formatResult(result);
      await api("sendMessage", {
        chat_id,
        text: msgText,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });
      return ok();
    }

    await api("sendMessage", { chat_id, text: "Try /war3 or /war5" });
    return ok();
  } catch (e) {
    console.error(e);
    return ok(); // Always 200 so Telegram doesn't retry
  }
};

// ===== Game engine =====
function playWar(numPlayers, handSize) {
  const deck = buildDeck(); shuffle(deck);
  const hands = deal(deck, numPlayers, handSize); // hands[p][r] is card for player p round r
  const scores = Array(numPlayers).fill(0);
  const rounds = [];

  for (let r = 0; r < handSize; r++) {
    const plays = hands.map(h => h[r]);
    const res = resolveRound(plays, hands, r);
    scores[res.winner] += 1;
    rounds.push(res);
  }
  return { numPlayers, handSize, rounds, scores };
}

function buildDeck() {
  const suits = ["♠","♥","♦","♣"];
  const ranks = [
    {r:"2",v:2},{r:"3",v:3},{r:"4",v:4},{r:"5",v:5},{r:"6",v:6},{r:"7",v:7},
    {r:"8",v:8},{r:"9",v:9},{r:"10",v:10},{r:"J",v:11},{r:"Q",v:12},{r:"K",v:13},{r:"A",v:14}
  ];
  const d=[]; for (const s of suits) for (const rk of ranks) d.push({rank:rk.r,suit:s,val:rk.v}); return d;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} }
function deal(deck, players, handSize){
  const hands = Array.from({length:players},()=>[]);
  for(let i=0;i<players*handSize;i++){ hands[i%players].push(deck[i]); }
  return hands;
}
const label = i => ["Knight 1","Knight 2","Knight 3","Knight 4","Knight 5"][i] || `P${i+1}`;
function cardStr(c){ return `${c.rank}${c.suit}`; }
function topIndices(vals){ const m=Math.max(...vals); const idx=[]; for(let i=0;i<vals.length;i++) if(vals[i]===m) idx.push(i); return idx; }

function resolveRound(plays, hands, rIndex){
  const played = plays.map((c,i)=>({i,card:c}));
  const log = [];
  log.push(`Round ${rIndex+1}: ` + played.map(p=>`${label(p.i)} ${cardStr(p.card)}`).join(" | "));

  let contenders = topIndices(played.map(p=>p.card.val));
  let revealIdx = rIndex;
  const warLogs = [];
  let step = 0;

  while (contenders.length > 1) {
    step++;
    revealIdx++; // burn one
    if (revealIdx >= hands[0].length) break; // out of cards
    revealIdx++; // reveal next
    if (revealIdx >= hands[0].length) break;

    const reveals = contenders.map(pi => ({ i: pi, card: hands[pi][revealIdx] }));
    warLogs.push(`  ⚔️ War step ${step}: ` + reveals.map(p=>`${label(p.i)} ${cardStr(p.card)}`).join(" | "));
    const vals = reveals.map(p=>p.card.val);
    const winnersLocal = topIndices(vals);
    contenders = winnersLocal.map(idx => contenders[idx]);
  }

  const winner = contenders[0];
  log.push(...warLogs);
  log.push(`  🏆 Winner: ${label(winner)}${warLogs.length ? " (after war)" : ""}`);
  return { winner, log };
}

function formatResult({ numPlayers, handSize, rounds, scores }){
  const head = `*Warchester — I Declare War*\nPlayers: ${numPlayers} • Rounds: ${handSize}\n`;
  const body = rounds.map(r=>r.log.join("\n")).join("\n");
  const board = scores
    .map((s,i)=>({i,s}))
    .sort((a,b)=>b.s-a.s)
    .map((e,rank)=>`${["🥇","🥈","🥉","🏅","🏅"][rank]||"🏅"} ${label(e.i)} — *${e.s}*`)
    .join("\n");
  return `${head}\n${body}\n\n*Final Board*\n${board}`;
}

function ok(){ return { statusCode: 200, body: JSON.stringify({ ok: true }) }; }