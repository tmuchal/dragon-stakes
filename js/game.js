// Dragon Stakes: a project stakes a pool of RF into an open sky. Fly in on a dragon with your Rare Friend, free or
// with a stake of your own, and take coins from gold rings, wild monsters and other riders. A fight is two rounds of
// call and response: one rider taps any rhythm over four beats, the other has to play it back. Land at the Roost to
// move what you carry into your safe purse.
// Alone, every other rider is flown by the computer. In a shared sky (room code) up to eight players fly among them:
// the host's World is the truth for coins, rings, monsters and fights; every device flies its own dragon and mirrors the rest.
import { friends, addFriend, sprite, avatar, loadFriendFromChain, sha256hex, randomHex } from "./chain.js";
import { World, spoils, KINDS, R, CEIL, FIGHT_RANGE, RING_R, MAGNET, ITEMS, DARE, MONSTERS, SPIN_SECS, POOL } from "./world.js";
import { View } from "./view.js";
import { dragonThumbs } from "./dragons.js";
import { SPB, Band } from "./rhythm.js";
import { Net, netReady, HOST } from "./net.js";
import { cleanHandle, intentUrl, siteUrl, PROJECT, xStatus, xMe, xLogout, xVerify } from "./xlink.js";

const params = new URLSearchParams(location.search);
const TOUCH = matchMedia("(pointer: coarse)").matches || params.has("touch");
document.body.classList.toggle("is-touch", TOUCH);
const AUTO = params.has("auto");                                   // test hook: a bot flies and fights
const BOT_MISS = Number(params.get("miss")) || 0.06;               // test hook: how often the bot drops an echo tap
const CALL = 4, GAP = 4, ECHO0 = CALL + GAP, ROUND = ECHO0 + CALL, LEAD = 4;
const TOL = { easy: 0.26, club: 0.19, pro: 0.14 };                 // how far (in beats) an echo tap may sit from the call tap it answers
const CPU_LEVEL = { easy: -0.12, club: 0, pro: 0.05 };
const MIN_GAP = 0.22, MAX_TAPS = 8, STAKES = [0, 10, 25, 50, 100], START_PURSE = 1000;   // 0 is flying free: nothing brought, nothing at risk

const $ = id => document.getElementById(id);
const NUM = new Intl.NumberFormat("en-US"), fmt = n => NUM.format(Math.round(n));   // one formatter for every number on screen
const pm = (n, sign) => n ? `${sign}${fmt(n)} RF` : "0 RF";            // a signed amount, and a plain zero
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const cleanName = (s, n = 16) => (typeof s === "string" ? s : typeof s === "number" ? String(s) : "").replace(/[<>&"'`\\\u0000-\u001f]/g, "").trim().slice(0, n);   // names go into the page as they are, so nothing that could be markup
const store = {
  get(k, d) { try { const v = localStorage.getItem("dgs1." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dgs1." + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

// ---------- words ----------
let lang = "en";
const TEXT = {
  en: {
    ember: "Ember Drake", emberT: "Balanced. The classic.", wyvern: "Frost Wyvern", wyvernT: "Fastest dive.", lung: "Storm Lung", lungT: "Tightest turns. Climbs fastest.", bone: "Bone Wyrm", boneT: "Shielded 14s after a fight.",
    gold: "Gold Hoarder", goldT: "Rings pay 2 RF. Slow.", jade: "Jade Feather", jadeT: "Rides thermals best. Keeps its speed longest.", you: "You", soundOn: "Sound on", soundOff: "Sound off", pause: "Pause", resume: "Resume",
    purseLine: "Safe purse {n} RF · simulated for the Vibeathon", hint: "<kbd>W</kbd><kbd>S</kbd> climb / dive · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Shift</kbd> boost · <kbd>E</kbd> fight / land · <kbd>Esc</kbd> pause",
    hintDuel: "<kbd>Space</kbd>, click or tap to play the rhythm", pFight: "<kbd>E</kbd> Fight {who}", pFightSub: "Win +{g} RF · lose −{l} RF", pBank: "<kbd>E</kbd> Land and bank {n} RF", pBankSub: "It goes into your safe purse",
    join: "{who} flew in carrying {n} RF", took: "{w} took {n} RF from {l}", hunted: "{who} is hunting you. Outfly it, hide in the Roost, or fight.", edge: "The sea wind turns you back toward the islands. The sky ends out here.",
    shield: "Shielded for {n}s", noPause: "You can't pause during a fight.", fight: "FIGHT", round: "Round {n} of 2", rule: "More hits wins · lose −{l} RF · win +{w} RF", roleCall: "Calling", roleEcho: "Echoing",
    callNow: "press SPACE in any rhythm, every tap counts", listen: "listen", echoNow: "press SPACE to echo it now", laidOut: "here is the rhythm", ready: "ready", getCall: "{who}: tap any rhythm",
    getEcho: "{who}: echo this rhythm", goCall: "CALL!", goEcho: "ECHO!", turnEcho: "{who} ECHOES", callTrack: "CALL · {who}", echoTrack: "ECHO · {who}", rHits: "{n} HITS", rHit1: "1 HIT", rBlocked: "BLOCKED", rWeak: "WEAK CALL",
    rSub: "{who} missed {m}, late {l}, stray taps {x}", rWeakSub: "Only {n} taps. A call needs at least 3", won: "+{g} RF", wonSub: "You took {a} RF from {who}. {b} RF burned.", lost: "−{a} RF",
    lostSub: "{who} took half of what you carried.", draw: "DRAW", drawSub: "Nobody loses a coin.", kBank: "Landed at the Roost", kQuit: "Left the sky", kOut: "Knocked out of the sky", hOut: "Your stake is gone",
    sBank: "You brought {s} RF and landed with {n} RF.", sOut: "{who} took the last of it. Stake again and get it back.", stStart: "Brought", stRings: "Gold rings", stWon: "Fights won", stLost: "Fights lost", stDraw: "Draws",
    stTaken: "Taken from others", stGiven: "Lost to others", stBurn: "Burned in your fights and dares", stHome: "Landed with", stPurse: "Safe purse now", copied: "Copied", copyFail: "Copy failed",
    readMsg: "Reading #{id} from Robinhood Chain…", enterId: "Enter a token ID.",
    logIntro: "A fight is two rounds. In each round one rider calls a rhythm and the other echoes it. Every call tap the echo misses, every late answer and every stray echo tap is a hit for the caller; a call with fewer than 3 taps lands nothing. More hits wins and takes half of what the loser carries, rounded up. 5% of what moves is burned. A red ring is a tap the echo missed, an orange one a late answer.",
    logRow: "Fight {i} · You vs {who}", logRound: "Round {r} · caller: {who} · {n} taps", logEcho: "echo: {who} · missed {m}, late {l}, stray {x} = {k} {h}", logWon: "Won +{g} RF ({a} moved, {b} burned)", logLost: "Lost −{a} RF",
    logDraw: "Draw · nothing moved", logEmpty: "No fights or dares yet. They are listed here as they happen.", logOk: "Recount: {s} brought + {r} from rings + {w} won − {l} lost = {x} RF. It matches what you carry.",
    logBad: "Recount: {s} brought + {r} from rings + {w} won − {l} lost = {x} RF, but you carry {y} RF.",
    logChance: "What chance decides: where the other riders fly, and how well the computer riders tap. Your own fights are settled only by the taps above. This sky's own number: {seed}", menu: "Menu", close: "Close",
    noMenu: "You can't open the menu during a fight.", hintSky: "<kbd>W</kbd><kbd>S</kbd> climb / dive · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Shift</kbd> boost · <kbd>E</kbd> fight / land · <kbd>Esc</kbd> menu",
    pausedHead: "Paused", pausedSub: "The sky and the music are stopped.", menuHead: "Menu", menuSub: "A shared sky keeps moving while this is open.", skyOff: "Online play could not load. You can still fly alone.",
    skyOpening: "Opening a sky…", skyOpen: "Sky {code} is open. Share the code or the invite link, then take off.", skyJoining: "Joining sky {code}…", skyIn: "You are in sky {code}. Take off when you are ready.",
    skyNone: "No sky with that code. Check it and try again.", skyFull: "That sky is full.", skyErr: "Could not connect ({e}). You can still fly alone.", skyClosed: "The sky has closed. You can fly alone or join another.",
    skyTap: "Sky {code}: press Join to enter.", linkCopied: "Invite link copied.", pYou: "you", pHost: "host", pFlying: "flying · {n} RF", pGround: "on the ground", leftSky: "{who} left the sky", kClosed: "The sky has closed",
    logSky: "In a shared sky the host's device counts the hits and moves the coins, and every device shows the same result.", pFightCrown: "Crowned: win +{g} RF, three quarters · lose −{l} RF", pLand: "<kbd>E</kbd> Land",
    pLandSub: "You carry nothing yet", pNeed: "Carry at least 1 RF to fight. A gold ring pays 1 RF.", pEmpty: "{who} carries nothing to take", pShielded: "{who} is shielded", pDare: "<kbd>E</kbd> Take the {who}'s dare",
    pDareSub: "Luck decides · its hoard {h} RF · you carry {c} RF · {s}s", pDareNo: "<kbd>Q</kbd> No thanks", poolLine: "This sky holds {n} RF, put up by the project. Fly in and take your share.",
    poolSpent: "This sky's pool is spent. Riders can still fight over what is carried.", poolOut: "Pool spent", boardK: "Riders in the sky · {n} RF carried", free: "Fly free",
    stakeFree: "Fly free: take off with nothing and build a stake from rings, treasure and dares. From 1 RF you can fight, and be fought.",
    stakeRisk: "Your {n} RF is yours from the first second, and at risk until you land at the Roost.", goMain: "Take off", goFree: "Free · nothing at risk", goCost: "{s} RF stake", goItems: "{i} RF shop",
    goNeed: "Create or join a sky first", crownYou: "THE CROWN IS YOURS", crownYouSub: "Whoever beats you takes three quarters", crownTook: "{who} took the crown", crownChip: "Crowned", streak: "Streak x{n}",
    wonCrown: "You beat the crowned rider and took {a} RF, three quarters. {b} RF burned.", lostCrown: "{who} beat the crown and took three quarters.", lostInsured: "{who} won. Insurance held the loss to a third.",
    forfeit: "{who} left the sky. You win by forfeit and take {a} RF.", evStorm: "Ring storm", evStormSub: "A spiral of rings worth 2 RF each, over the island marked on the map", evPrize: "Treasure",
    evPrizeSub: "10 RF on a summit, marked on the map. First rider there takes it", prizeTook: "{who} took the treasure", prizeYou: "You took the treasure", rank0: "Hatchling", rank1: "Fledgling", rank2: "Sky Rider",
    rank3: "Raider", rank4: "Wing Captain", rank5: "Dragon Lord", rankNext: "{n} more to {r}", rankTop: "Top rank", rankGain: "+{n} this flight", rankUp: "Rank up: {r}", q_rings: "Collect {n} gold rings", q_wins: "Win {n} fights",
    q_bank: "Land at the Roost with {n} RF or more", q_crown: "Beat the crowned rider", q_streak: "Reach a streak of {n}", q_ceiling: "Ride rising air to the top of a thermal", q_arcs: "Fly through rings on {n} different arcs",
    q_echo: "Win a fight after echoing a rhythm with no mistakes", q_profit: "Land at the Roost with {n} RF more than you brought", q_prize: "Take a treasure", q_storm: "Collect {n} storm rings", q_dares: "Accept {n} dares",
    q_dareWin: "Win coins from a monster {n} times", questDone: "Quest done: {q} · +{n} rank points", questSum: "{a} of 3 done", questAll: "All three done. New quests in {h}h {m}m.", questNew: "New quests in {h}h {m}m",
    i_magnet: "Ring magnet", i_magnetT: "Rings from 2.5 times the distance", i_insure: "Insurance", i_insureT: "The first fight you lose costs a third, not half", i_start: "Head start",
    i_startT: "20 seconds of shield at take-off, not 5", shopSum: "{n} RF selected", shopNone: "Nothing selected", burnLine: "What you pay here is burned. Burned by you so far: {n} RF.", m_imp: "imp", m_griffin: "griffin",
    m_serpent: "serpent", m_gargoyle: "gargoyle", wheelTitle: "The {who}'s dare", wheelSub: "Its hoard {h} RF · you carry {c} RF", dChance: "Chance", dOutcome: "Outcome", dNow: "This dare", d0: "Jackpot: you take its whole hoard",
    d1: "You take half its hoard", d2: "You take a quarter of its hoard", d3: "Nothing moves", d4: "It takes a quarter of what you carry", d5: "It takes half of what you carry", dNothing: "nothing to lose",
    dareWonSub: "You took {a} RF from the {who}. {b} RF burned.", dareLostSub: "The {who} took {a} RF. {b} RF burned.", dareNone: "NOTHING MOVES", dareNoneSub: "The {who} flies off laughing.",
    dareSafeSub: "You had nothing to lose.", dareToastWon: "{r} won {n} RF from a {who}", dareToastLost: "{r} lost {n} RF to a {who}", kLost: "Connection lost", kAway: "Landed while you were away",
    skyLost: "Connection lost. What you carried is in your purse.", rejoin: "Rejoin sky {code}", hTook: "You took {n} RF out of the sky", hEven: "You came home even", hLeft: "You left {n} RF in the sky",
    hFree: "You landed with nothing", sOutDare: "The {who} took the last of it. Fly free and win it back.", stDare: "Won / lost on dares", stShop: "Burned in the shop", stBest: "Best streak", stPool: "Sky pool left",
    coachN: "Tip {a}/5", coach0: "Hold <kbd>W</kbd> to climb and <kbd>S</kbd> to dive. Let go and the dragon levels off.", coach1: "Fly through a gold ring. Each one pays 1 RF from the sky's pool.",
    coach2: "White rings rising over an island are rising air. Fly into them and they lift you for free.", coach3: "Get close to another rider and press <kbd>E</kbd> to fight for half of what they carry.",
    coach4: "Coins are only yours once you land. Fly into the gold light at the centre and press <kbd>E</kbd>.",
    logIntro2: "Beating the crowned rider pays three quarters; a rider with insurance loses a third once. A dare is one spin of the wheel with the odds shown, rolled from this sky's own number.", logCrown: "crown: three quarters",
    logInsured: "insured: a third", logForfeit: "forfeit", logDare: "Dare · the {who} · hoard {h} RF, you carried {c} RF", logDareOut: "{p}% chance: {o}", title: "Dragon Stakes",
    desc: "A project stakes RF into an open sky. Fly in on a dragon with your Rare Friend, free or with a stake, and take coins from gold rings, wild monsters and other riders in a call-and-response rhythm duel.", secs: "{n}s",
    getCallMe: "Your turn! Press SPACE in any rhythm", getEchoMe: "Your turn! Press SPACE to echo this rhythm", turnEchoMe: "YOU ECHO", pFight_t: "Fight {who}", pBank_t: "Land and bank {n} RF", pLand_t: "Land",
    pDare_t: "Take the {who}'s dare", pDareNo_t: "Decline", coach0_t: "Push the stick up to climb, down to dive. Let go to level off.", coach3_t: "Get close to a rider and tap Fight to win half of their coins.",
    coach4_t: "Coins are yours once you land. Fly into the gold light and tap Land.", rankHave: "{n} rank points", goFreeShop: "No stake", sBank0: "You took off with nothing and landed with nothing.",
    copyText: "Dragon Stakes · {k} · brought {s} RF, landed with {n} RF · fights {w}W {l}L {d}D · dares {x} · {f}", noFriend: "Friend #{id} does not exist.",
    gen0: "Friend #{id} is generation 0. The Roost seats hardwired Friends (generation 1 or higher).", loadFail: "Could not read Robinhood Chain just now. Try again.", nameLabel: "Your name (up to 16 letters)",
    coach1_t: "Fly through a gold ring. Each pays 1 RF from the sky's pool.", coach2_t: "White rings over an island are rising air. Fly in for a free lift.", getCallMe_t: "Your turn! Tap any rhythm",
    getEchoMe_t: "Your turn! Tap to echo this rhythm", callNow_t: "tap any rhythm, every tap counts", echoNow_t: "tap to echo it now", quitBank: "Land now · bank {n} RF",
    quitAway: "Leave now: keep {k} RF, {b} RF goes back to the sky", sAway: "You left away from the Roost: you keep {n} RF, and {b} RF went back to the sky.", watch: "watch",
    bTook: "I took {n} RF out of the sky in Dragon Stakes 🐉", bEven: "I came home even from the sky in Dragon Stakes 🐉", bLeft: "I left {n} RF in the sky in Dragon Stakes 🐉", bOut: "I lost my whole stake in Dragon Stakes 🐉 Revenge next flight.",
    bFree: "I rode a dragon through the sky in Dragon Stakes 🐉", bWins: "{w} fights won.", bWin1: "1 fight won.", bTail: "Flying as @{h} with a @{p} Friend. Beat me:", bTail0: "Flying with a @{p} Friend. Beat me:",
    mFight: "I just took {n} RF from {who} in Dragon Stakes 🐉", mCrown: "I just took {n} RF from the crowned rider in Dragon Stakes 🐉", mJack: "Jackpot! I took the {who}'s whole hoard, {n} RF, in Dragon Stakes 🐉",
    tWon: "+{n} RF from {who}", tJack: "Jackpot +{n} RF", share: "Share", inviteText: "Fly with me in Dragon Stakes 🐉 Sky code {code}, a sky full of @{p} Friends. Join here:",
    xOk: "Connected as @{h}", xNo: "X sign-in was cancelled.", xErr: "Could not sign in with X just now. A typed handle works the same in the game.", xLeft: "Disconnected from X.",
  },
  ko: {
    ember: "불꽃 드레이크", emberT: "균형형. 기본에 충실", wyvern: "서리 와이번", wyvernT: "급강하가 가장 빠름", lung: "폭풍 용", lungT: "선회가 가장 빠르고 가장 빨리 오름", bone: "해골 와이엄", boneT: "싸움 뒤 보호막 14초", gold: "황금 수집가", goldT: "링 하나에 2 RF. 느림", jade: "비취 깃털뱀",
    jadeT: "상승 기류를 가장 잘 타고 속도를 가장 오래 지킴", you: "나", soundOn: "소리 켬", soundOff: "소리 끔", pause: "잠시 멈춤", resume: "계속하기", purseLine: "안전한 지갑 {n} RF · 바이브톤용 가상 코인",
    hint: "<kbd>W</kbd><kbd>S</kbd> 상승 / 하강 · <kbd>A</kbd><kbd>D</kbd> 방향 · <kbd>Shift</kbd> 가속 · <kbd>E</kbd> 싸움 / 내리기 · <kbd>Esc</kbd> 멈춤", hintDuel: "<kbd>스페이스</kbd>, 클릭, 탭으로 리듬을 칩니다", pFight: "<kbd>E</kbd> {who}에게 싸움 걸기",
    pFightSub: "이기면 +{g} RF · 지면 −{l} RF", pBank: "<kbd>E</kbd> 내려서 {n} RF 챙기기", pBankSub: "안전한 지갑으로 들어갑니다", join: "{who} 등장 · {n} RF를 들고 왔습니다", took: "{w|이} {l}에게서 {n} RF를 뺏었습니다", hunted: "{who|이} 쫓아옵니다. 따돌리거나, 둥지로 숨거나, 싸우세요.",
    edge: "바닷바람이 섬 쪽으로 되돌려 보냅니다. 여기가 하늘의 끝입니다.", shield: "보호막 {n}초", noPause: "싸움 중에는 멈출 수 없습니다.", fight: "싸움!", round: "{n}판 / 2판", rule: "더 많이 맞힌 쪽 승리 · 지면 −{l} RF · 이기면 +{w} RF", roleCall: "먼저 치기", roleEcho: "따라 치기",
    callNow: "스페이스를 아무 때나 치세요, 치는 대로 찍힙니다", listen: "잘 들으세요", echoNow: "지금 스페이스로 따라 치세요", laidOut: "이 리듬입니다", ready: "준비", getCall: "{who} 차례: 아무 리듬이나 칩니다", getEcho: "{who} 차례: 이 리듬을 따라 칩니다", goCall: "먼저 치기!", goEcho: "따라 치기!",
    turnEcho: "{who} 따라 칠 차례", callTrack: "먼저 치기 · {who}", echoTrack: "따라 치기 · {who}", rHits: "{n}방 명중", rHit1: "1방 명중", rBlocked: "전부 막음", rWeak: "약한 리듬", rSub: "놓친 박자 {m} · 늦은 박자 {l} · 헛친 박자 {x}",
    rWeakSub: "{n}번만 쳤습니다. 먼저 칠 때는 최소 3번", won: "+{g} RF", wonSub: "{who}에게서 {a} RF를 뺏었습니다. {b} RF 소각.", lost: "−{a} RF", lostSub: "{who|이} 내가 든 코인의 절반을 가져갔습니다.", draw: "무승부", drawSub: "아무도 코인을 잃지 않습니다.", kBank: "둥지에 내렸습니다",
    kQuit: "하늘을 떠났습니다", kOut: "하늘에서 밀려났습니다", hOut: "판돈을 모두 잃었습니다", sBank: "{s} RF를 들고 가서 {n} RF를 들고 내렸습니다.", sOut: "{who|이} 마지막 코인까지 가져갔습니다. 다시 걸고 되찾으세요.", stStart: "들고 간 판돈", stRings: "금색 링", stWon: "이긴 싸움", stLost: "진 싸움",
    stDraw: "무승부", stTaken: "뺏은 코인", stGiven: "뺏긴 코인", stBurn: "내 싸움과 내기에서 소각", stHome: "들고 내린 코인", stPurse: "지금 안전한 지갑", copied: "복사됨", copyFail: "복사 실패", readMsg: "Robinhood Chain에서 #{id}를 읽는 중…", enterId: "토큰 번호를 입력하세요.",
    logIntro: "싸움은 두 판입니다. 판마다 한쪽이 먼저 치고 다른 쪽이 따라 칩니다. 따라 치다 놓친 박자, 늦은 박자, 헛친 박자가 전부 먼저 친 쪽의 한 방이고, 3번 미만으로 친 리듬은 한 방도 못 맞힙니다. 더 많이 맞힌 쪽이 이겨서 진 쪽이 든 코인의 절반(올림)을 가져가고, 옮겨지는 코인의 5%는 소각됩니다. 빨간 테두리는 따라 치다 놓친 박자, 주황색은 늦은 박자입니다.",
    logRow: "싸움 {i} · 나 대 {who}", logRound: "{r}판 · {who} 먼저 치기 · {n}번", logEcho: "{who} 따라 치기 · 놓친 박자 {m}, 늦은 박자 {l}, 헛친 박자 {x} = {k}방", logWon: "승리 +{g} RF ({a} 이동, {b} 소각)", logLost: "패배 −{a} RF", logDraw: "무승부 · 이동 없음",
    logEmpty: "아직 싸움도 내기도 없습니다. 생길 때마다 여기에 쌓입니다.", logOk: "검산: 들고 간 {s} + 링 {r} + 딴 것 {w} − 잃은 것 {l} = {x} RF. 지금 든 코인과 같습니다.", logBad: "검산: 들고 간 {s} + 링 {r} + 딴 것 {w} − 잃은 것 {l} = {x} RF인데, 지금 든 코인은 {y} RF입니다.",
    logChance: "운이 정하는 것: 다른 라이더가 어디로 나는지, 컴퓨터 라이더가 얼마나 잘 치는지뿐입니다. 내 싸움은 위에 찍힌 박자로만 판정됩니다. 이 하늘의 고유 번호: {seed}", menu: "메뉴", close: "닫기", noMenu: "싸움 중에는 메뉴를 열 수 없습니다.",
    hintSky: "<kbd>W</kbd><kbd>S</kbd> 상승 / 하강 · <kbd>A</kbd><kbd>D</kbd> 방향 · <kbd>Shift</kbd> 가속 · <kbd>E</kbd> 싸움 / 내리기 · <kbd>Esc</kbd> 메뉴", pausedHead: "잠시 멈춤", pausedSub: "하늘과 음악이 멈췄습니다.", menuHead: "메뉴",
    menuSub: "함께 나는 하늘은 메뉴를 열어도 계속 움직입니다.", skyOff: "온라인 기능을 불러오지 못했습니다. 혼자 날기는 그대로 됩니다.", skyOpening: "하늘을 여는 중…", skyOpen: "{code} 하늘이 열렸습니다. 코드나 초대 링크를 보내고 날아오르세요.", skyJoining: "{code} 하늘에 들어가는 중…",
    skyIn: "{code} 하늘에 들어왔습니다. 준비되면 날아오르세요.", skyNone: "그 코드의 하늘이 없습니다. 코드를 확인하고 다시 해 보세요.", skyFull: "그 하늘은 가득 찼습니다.", skyErr: "연결하지 못했습니다 ({e}). 혼자 날기는 그대로 됩니다.", skyClosed: "하늘이 닫혔습니다. 혼자 날거나 다른 하늘에 들어가세요.",
    skyTap: "{code} 하늘: 들어가기를 누르세요.", linkCopied: "초대 링크를 복사했습니다.", pYou: "나", pHost: "방장", pFlying: "비행 중 · {n} RF", pGround: "땅에 있음", leftSky: "{who} 님이 하늘을 떠났습니다", kClosed: "하늘이 닫혔습니다",
    logSky: "함께 나는 하늘에서는 방장 기기가 명중을 세고 코인을 옮기며, 모든 기기가 같은 결과를 봅니다.", pFightCrown: "왕관: 이기면 +{g} RF(4분의 3) · 지면 −{l} RF", pLand: "<kbd>E</kbd> 내리기", pLandSub: "아직 든 코인이 없습니다", pNeed: "1 RF 이상 들어야 싸울 수 있습니다. 금색 링 하나가 1 RF.",
    pEmpty: "{who|은} 뺏을 코인이 없습니다", pShielded: "{who} 보호막 중", pDare: "<kbd>E</kbd> {who}의 내기 받기", pDareSub: "운으로 결정 · 보물 더미 {h} RF · 내 코인 {c} RF · {s}초", pDareNo: "<kbd>Q</kbd> 거절",
    poolLine: "이 하늘에는 프로젝트가 건 {n} RF가 있습니다. 날아 들어와 내 몫을 챙기세요.", poolSpent: "이 하늘의 풀이 바닥났습니다. 들고 있는 코인을 두고는 계속 싸울 수 있습니다.", poolOut: "풀 소진", boardK: "하늘의 라이더 · 합계 {n} RF", free: "빈손으로",
    stakeFree: "빈손으로 날기: 아무것도 안 걸고 올라가 링, 보물, 내기로 코인을 모읍니다. 1 RF부터 싸울 수 있고, 싸움을 걸릴 수도 있습니다.", stakeRisk: "{n} RF는 처음부터 내 것이지만, 둥지에 내리기 전까지 뺏길 수 있습니다.", goMain: "날아오르기", goFree: "무료 · 잃을 것 없음", goCost: "판돈 {s} RF",
    goItems: "상점 {i} RF", goNeed: "먼저 하늘을 만들거나 들어가세요", crownYou: "왕관을 썼습니다", crownYouSub: "나를 이기는 쪽은 4분의 3을 가져갑니다", crownTook: "{who|이} 왕관을 썼습니다", crownChip: "왕관", streak: "{n}연승",
    wonCrown: "왕관 쓴 라이더를 이겨 4분의 3인 {a} RF를 가져왔습니다. {b} RF 소각.", lostCrown: "{who|이} 왕관을 꺾고 4분의 3을 가져갔습니다.", lostInsured: "{who}의 승리. 보험 덕에 3분의 1만 잃었습니다.", forfeit: "{who|이} 하늘을 떠났습니다. 기권승으로 {a} RF를 가져옵니다.", evStorm: "링 폭풍",
    evStormSub: "지도에 표시된 섬 위로 하나에 2 RF짜리 링이 나선으로 떴습니다", evPrize: "보물", evPrizeSub: "지도에 표시된 섬 꼭대기에 10 RF. 먼저 닿는 라이더의 것", prizeTook: "{who|이} 보물을 가져갔습니다", prizeYou: "보물을 가져왔습니다", rank0: "아기 용", rank1: "풋내기", rank2: "하늘 라이더",
    rank3: "약탈자", rank4: "편대장", rank5: "용의 군주", rankNext: "{r}까지 {n}점", rankTop: "최고 등급", rankGain: "이번 비행 +{n}점", rankUp: "등급 상승: {r}", q_rings: "금색 링 {n}개 모으기", q_wins: "싸움 {n}번 이기기", q_bank: "{n} RF 이상 들고 둥지에 내리기",
    q_crown: "왕관 쓴 라이더 이기기", q_streak: "{n}연승 하기", q_ceiling: "상승 기류를 타고 기류 꼭대기까지 오르기", q_arcs: "서로 다른 링 줄 {n}곳 통과하기", q_echo: "리듬을 실수 없이 따라 치고 그 싸움 이기기", q_profit: "들고 간 것보다 {n} RF 더 들고 둥지에 내리기", q_prize: "보물 가져오기",
    q_storm: "폭풍 링 {n}개 모으기", q_dares: "내기 {n}번 받기", q_dareWin: "몬스터에게서 코인 {n}번 따내기", questDone: "퀘스트 완료: {q} · 등급 점수 +{n}점", questSum: "3개 중 {a}개 완료", questAll: "세 개 모두 완료. 새 퀘스트까지 {h}시간 {m}분.", questNew: "새 퀘스트까지 {h}시간 {m}분",
    i_magnet: "링 자석", i_magnetT: "2.5배 거리에서 링 획득", i_insure: "보험", i_insureT: "처음 지는 싸움에서 절반 대신 3분의 1만 잃음", i_start: "빠른 출발", i_startT: "이륙 보호막 5초 대신 20초", shopSum: "{n} RF 선택", shopNone: "선택 없음",
    burnLine: "여기서 낸 코인은 소각됩니다. 지금까지 내가 소각한 코인: {n} RF.", m_imp: "임프", m_griffin: "그리핀", m_serpent: "서펜트", m_gargoyle: "가고일", wheelTitle: "{who}의 내기", wheelSub: "보물 더미 {h} RF · 내 코인 {c} RF", dChance: "확률", dOutcome: "결과",
    dNow: "이번 내기", d0: "대박: 보물 더미를 전부 가져옴", d1: "보물 더미의 절반을 가져옴", d2: "보물 더미의 4분의 1을 가져옴", d3: "아무것도 움직이지 않음", d4: "내 코인의 4분의 1을 가져감", d5: "내 코인의 절반을 가져감", dNothing: "잃을 것 없음", dareWonSub: "{who}에게서 {a} RF를 따냈습니다. {b} RF 소각.",
    dareLostSub: "{who|이} {a} RF를 가져갔습니다. {b} RF 소각.", dareNone: "변동 없음", dareNoneSub: "{who|이} 웃으며 날아갑니다.", dareSafeSub: "잃을 코인이 없었습니다.", dareToastWon: "{r|이} {who}에게서 {n} RF를 따냈습니다", dareToastLost: "{r|이} {who}에게 {n} RF를 잃었습니다",
    kLost: "연결이 끊겼습니다", kAway: "자리를 비운 사이 내렸습니다", skyLost: "연결이 끊겼습니다. 들고 있던 코인은 지갑에 넣었습니다.", rejoin: "{code} 하늘에 다시 들어가기", hTook: "하늘에서 {n} RF를 가져왔습니다", hEven: "본전으로 돌아왔습니다", hLeft: "하늘에 {n} RF를 두고 왔습니다", hFree: "빈손으로 내렸습니다",
    sOutDare: "{who|이} 마지막 코인까지 가져갔습니다. 빈손으로 날아 되찾으세요.", stDare: "내기로 딴 것 / 잃은 것", stShop: "상점에서 소각", stBest: "최고 연승", stPool: "남은 하늘 풀", coachN: "도움말 {a}/5", coach0: "<kbd>W</kbd>를 누르고 있으면 상승, <kbd>S</kbd>는 하강. 손을 떼면 수평을 잡습니다.",
    coach1: "금색 링을 통과해 보세요. 하나에 1 RF가 하늘 풀에서 나옵니다.", coach2: "섬 위로 올라가는 흰 고리는 상승 기류입니다. 들어가면 공짜로 떠오릅니다.", coach3: "다른 라이더 가까이 가서 <kbd>E</kbd>를 누르면 상대가 든 코인의 절반을 걸고 싸웁니다.",
    coach4: "코인은 내려야 내 것이 됩니다. 가운데 금빛 속으로 들어가 <kbd>E</kbd>를 누르세요.", logIntro2: "왕관 쓴 라이더를 이기면 4분의 3을 가져가고, 보험이 있는 라이더는 한 번 3분의 1만 잃습니다. 내기는 확률이 적힌 돌림판 한 번이며, 이 하늘의 고유 번호에서 나온 주사위로 정해집니다.", logCrown: "왕관: 4분의 3",
    logInsured: "보험: 3분의 1", logForfeit: "기권승", logDare: "내기 · {who} · 보물 더미 {h} RF, 내 코인 {c} RF", logDareOut: "확률 {p}%: {o}", title: "Dragon Stakes · 드래곤을 타고 코인을 뺏는 하늘",
    desc: "프로젝트가 RF를 걸어 둔 하늘. 레어 프렌드와 드래곤을 타고 빈손으로 또는 판돈을 들고 날아올라, 금색 링과 야생 몬스터, 다른 라이더에게서 코인을 가져오세요. 싸움은 먼저 치고 따라 치는 리듬 대결입니다.", secs: "{n}초", getCallMe: "내 차례! 스페이스로 아무 리듬이나 치세요", getEchoMe: "내 차례! 스페이스로 이 리듬을 따라 치세요",
    turnEchoMe: "내가 따라 칠 차례", pFight_t: "{who}에게 싸움 걸기", pBank_t: "내려서 {n} RF 챙기기", pLand_t: "내리기", pDare_t: "{who}의 내기 받기", pDareNo_t: "거절", goFreeShop: "판돈 없음", rankHave: "등급 점수 {n}점", sBank0: "빈손으로 올라가 빈손으로 내려왔습니다.",
    coach0_t: "스틱을 위로 밀면 상승, 아래로 밀면 하강. 놓으면 수평을 잡습니다.", coach3_t: "라이더에게 다가가 '싸움 걸기'를 누르면 코인 절반을 걸고 싸웁니다.", coach4_t: "코인은 내려야 내 것. 금빛 속으로 들어가 '내리기'를 누르세요.",
    copyText: "Dragon Stakes · {k} · {s} RF 들고 가서 {n} RF 들고 내림 · 싸움 {w}승 {l}패 {d}무 · 내기 {x}번 · {f}", noFriend: "#{id} 프렌드는 없습니다.", gen0: "#{id} 프렌드는 0세대입니다. 둥지에는 하드와이어드 프렌드(1세대 이상)만 탈 수 있습니다.",
    loadFail: "지금은 Robinhood Chain을 읽지 못했습니다. 다시 해 보세요.", nameLabel: "내 이름 (16자까지)", coach1_t: "금색 링을 통과해 보세요. 하나에 1 RF입니다.", coach2_t: "섬 위 흰 고리는 상승 기류. 들어가면 공짜로 떠오릅니다.", getCallMe_t: "내 차례! 아무 리듬이나 탭하세요",
    getEchoMe_t: "내 차례! 탭해서 이 리듬을 따라 치세요", callNow_t: "아무 때나 탭하세요, 치는 대로 찍힙니다", echoNow_t: "지금 탭해서 따라 치세요", quitBank: "지금 내리기 · {n} RF 챙기기", quitAway: "지금 떠나기: {k} RF만 챙기고 {b} RF는 하늘로 돌아감",
    sAway: "둥지가 아닌 곳에서 떠나 {n} RF만 챙겼고, {b} RF는 하늘로 돌아갔습니다.", watch: "지켜보기",
    bTook: "Dragon Stakes 하늘에서 {n} RF를 가져왔다 🐉", bEven: "Dragon Stakes 하늘에서 본전으로 돌아왔다 🐉", bLeft: "Dragon Stakes 하늘에 {n} RF를 두고 왔다 🐉", bOut: "Dragon Stakes에서 판돈을 몽땅 털렸다 🐉 다음 비행에 복수한다.",
    bFree: "Dragon Stakes에서 드래곤 타고 하늘을 날았다 🐉", bWins: "싸움 {w}승.", bWin1: "싸움 1승.", bTail: "@{h}, @{p} 프렌드 타고 출격. 나를 이겨 봐:", bTail0: "@{p} 프렌드 타고 출격. 나를 이겨 봐:",
    mFight: "Dragon Stakes에서 방금 {who}에게서 {n} RF를 뺏었다 🐉", mCrown: "Dragon Stakes에서 방금 왕관 쓴 라이더에게서 {n} RF를 뺏었다 🐉", mJack: "Dragon Stakes에서 대박! {who}의 보물 더미 {n} RF를 통째로 가져왔다 🐉",
    tWon: "{who}에게서 +{n} RF", tJack: "대박 +{n} RF", share: "공유", inviteText: "Dragon Stakes에서 같이 날자 🐉 하늘 코드 {code}, @{p} 프렌드들이 나는 하늘. 여기로 들어와:",
    xOk: "@{h} 계정으로 연결됨", xNo: "X 로그인을 취소했습니다.", xErr: "지금은 X로 로그인하지 못했습니다. 핸들을 직접 적어도 게임에서는 똑같이 보입니다.", xLeft: "X 연결을 끊었습니다.",
  },
};
// Korean particles depend on the last sound of the word before them, and here that word is a name: "{who|이}" writes
// the name and then 이 or 가 (은/는, 을/를 the same way). A number is read aloud in Korean, so its last digit decides.
function josa(word, p) {
  const c = String(word).trim().slice(-1), code = c.charCodeAt(0);
  const closed = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : /[013678]/.test(c) || /[lmnLMN]/.test(c);
  return { "이": closed ? "이" : "가", "은": closed ? "은" : "는", "을": closed ? "을" : "를" }[p] ?? "";
}
const t = (k, v = {}) => (TEXT[lang][k] ?? TEXT.en[k] ?? k).replace(/\{(\w+)(?:\|(.))?\}/g, (_, x, p) => (v[x] ?? "") + (p ? josa(v[x] ?? "", p) : ""));
const tk = (k, v) => t(TOUCH && TEXT.en[k + "_t"] ? k + "_t" : k, v);   // on a touch screen a line may have its own wording (no keycaps)

// What a monster says. Cheeky, never about real people. The dare lines are used when the taunt becomes a dare.
const TAUNTS = {
  en: {
    imp: ["Nice coins. Shame if someone spun a wheel.", "You fly like a brick with wings.", "I have seen faster clouds.", "Catch me? You could not catch a cold."],
    griffin: ["My hoard is bigger than your dragon.", "Is that a dragon or a large pigeon?", "Careful. The island will not move out of your way.", "I would race you, but I like a challenge."],
    serpent: ["Sss. You jingle when you fly.", "Such a small purse for such a big sky.", "I was old when that tower was a pebble.", "Do keep up."],
    gargoyle: ["I sat on a roof for 400 years and still turn better than you.", "Your landing will be memorable.", "Stone floats better than that.", "Go on. Flap harder."],
    dare: ["Spin my wheel. If you dare.", "One spin. My hoard against your nerve.", "Feeling lucky, little rider?"],
  },
  ko: {
    imp: ["코인 예쁘네. 돌림판 한번 안 돌리면 아깝겠어.", "날개 달린 벽돌처럼 나는구나.", "구름이 너보다 빠르던데.", "날 잡겠다고? 감기도 못 잡겠다."],
    griffin: ["내 보물 더미가 네 드래곤보다 크다.", "그거 드래곤이야, 큰 비둘기야?", "조심해. 섬은 안 비켜 준다.", "경주해 줄까 했는데, 난 상대가 돼야 재밌거든."],
    serpent: ["스스스. 날 때마다 짤랑거리네.", "하늘은 이렇게 넓은데 지갑은 참 작구나.", "저 탑이 조약돌일 때 난 이미 늙었지.", "좀 따라와 봐."],
    gargoyle: ["지붕에 400년 앉아 있었는데도 너보다 잘 돈다.", "착지가 볼만하겠어.", "돌이 그것보단 잘 뜨겠다.", "그래, 더 세게 퍼덕여 봐."],
    dare: ["내 돌림판, 돌릴 배짱 있어?", "딱 한 판. 내 보물 더미 대 네 배짱.", "오늘 운 좋은 것 같아, 꼬마 라이더?"],
  },
};
const lineOf = m => { const pool = TAUNTS[lang][m.state === "dare" ? "dare" : m.kind] || []; return pool[(m.line || 0) % pool.length] || ""; };

// ---------- state ----------
const band = new Band();
band.setMuted(store.get("muted", false));
let world = null, view = null, me = null, run = null, D = null, paused = false, t0 = 0, last = performance.now();
let level = "club", stake = 0, myKind = "ember", thumbs = {}, myFriend = null, pool = [], lastRun = null, offsetMs = Number(params.get("offset")) || 0;
let items = [], wheel = null, coach = null, isleCols = null, nBase = 0, flapPh = 0, hadShield = false, crownAt = 0;
const purse = () => store.get("purse", START_PURSE), setPurse = v => store.set("purse", Math.max(0, Math.round(v)));
// the shared sky: "solo" when flying alone, "host" when this device holds the truth, "guest" when it mirrors a host
let NET = null, role = "solo", skyTab = "alone", skyNote = null, lastSky = null, people = [], all = [], menu = false, landing = null, going = false, nextFid = 1, poseAt = 0, snapAt = 0, peopleAt = 0, actAt = 0;
const crowd = new Map(), refs = new Map(), byId = new Map();      // host: who is connected (peer id -> { name, rider }) and the fights it referees · guest: mirrored riders by id
const online = () => role !== "solo";
const IDLE = { turn: 0, climb: 0, throttle: 0 };
const lvl = () => D?.pvp ? "club" : level;                         // two players always fight on the same terms
const myName = () => cleanName(store.get("name", "")) || `${myFriend.family} #${myFriend.id}`;
// X: a handle the player typed (just text, shown as typed) or one that came back from signing in with X (xUser, checked
// by this site's server). Only a checked one gets the X mark, and only the host decides whether a guest's is checked.
let xOn = false, xUser = null;
const myHandle = () => xUser?.username || cleanHandle(store.get("xh", ""));
const nameOf = r => r === me || r?.mine ? t("you") : r?.xh ? "@" + r.xh : r?.name || `${r.f.family} #${r.f.id}`;
const XMARK = '<i class="xm" title="Signed in with X"></i>';
const fights = r => r ? r.fights.filter(f => !f.dare) : [];
// Song time as the player hears it: the device's own sound delay (large on wireless headphones) is taken off.
const heardLag = () => clamp(band.ctx?.outputLatency || 0, 0, 0.4);
const songT = () => band.now - t0 - offsetMs / 1000 - heardLag();
if (params.has("test")) window.__sky = () => ({
  t: world.t, now: songT(), paused, purse: purse(), riders: world.riders.length, fights: fights(run).length, landed: !$("result").hidden,
  me: me && { x: me.x, y: me.y, z: me.z, stake: me.stake, state: me.state, speed: me.speed, shield: me.shield, pitch: me.pitch, streak: me.streak || 0, crowned: !!me.crowned, items: me.items || [], insured: !!me.insured, magnet: !!me.magnet },
  D: D && { round: D.round, b0: D.cur.b0, caller: D.cur.caller, mine: D.mine, call: D.cur.call, resp: D.cur.resp, extra: D.cur.extra, over: D.cur.over, hits: D.hits, done: D.done, pvp: D.pvp },
  role, code: NET?.code || null, people: people.length, menu, myId: me?.id ?? null, ids: world.riders.map(r => r.id).sort((a, b) => a - b),
  humans: Object.fromEntries(world.riders.filter(r => r.human).map(r => [r.id, r.stake])),
  info: Object.fromEntries(world.riders.filter(r => r.human).map(r => [r.id, { name: r.name, items: r.items || [], insured: !!r.insured, magnet: !!r.magnet, shield: r.shield, away: !!r.away, streak: r.streak || 0, rank: r.rank ?? null }])),
  books: world.books, balanced: world.balanced, pool: world.pool, crown: world.crown?.id ?? null, crownStake: world.crown?.stake ?? 0,
  event: world.event && { type: world.event.type, isl: world.event.isl, left: world.event.until - world.t, up: world.event.rings.filter(i => world.rings[i].back <= world.t).length },
  monsters: world.monsters.map(m => ({ id: m.id, kind: m.kind, hoard: m.hoard, state: m.state, target: m.target?.id ?? null })), dare: me ? world.dareFor(me)?.id ?? null : null, wheel: !!wheel,
  record: (me ? run : lastRun)?.fights.map(f => f.dare ? { dare: true, k: f.k, dir: f.dir, amount: f.amount, burn: f.burn, gain: f.gain, result: f.result } : { fid: f.fid, pvp: f.pvp, ids: f.ids, hits: f.hits, result: f.result, amount: f.amount, burn: f.burn, gain: f.gain, crown: !!f.crown, share: f.share, forfeit: !!f.forfeit }) ?? [],
  home: lastRun?.home ?? null, why: lastRun?.why ?? null, run: (me ? run : lastRun) && (({ start, rings, rp, quests, best, shop }) => ({ start, rings, rp, quests, best, shop }))(me ? run : lastRun),
  rp: rp(), rank: rankOf(rp()), quests: quests().list, coach, burnt: store.get("burnt", 0), stake, items, away: world.riders.filter(r => r.away).map(r => r.id),
  x: { handle: myHandle(), connected: !!xUser, on: xOn, marks: Object.fromEntries(world.riders.filter(r => r.human).map(r => [r.id, { xh: r.xh || "", ok: !!r.xok }])) },
});

if (params.has("test")) { window.__poke = fn => fn(world, me); window.__net = () => NET; }   // test hooks: a check can put riders where it needs them, and cut its own link

// ---------- rank, quests and the shop: kept between flights in this browser, never RF ----------
const RANK_AT = [0, 60, 250, 700, 1800, 4500];                     // Hatchling, Fledgling, Sky Rider, Raider, Wing Captain, Dragon Lord
const rp = () => store.get("rp", 0), rankOf = p => RANK_AT.reduce((a, v, i) => p >= v ? i : a, 0);
// Rank points: 1 a ring, 20 a fight won (40 against the crowned rider), 10 a dare won, 1 per RF of profit landed at the Roost, and quests.
function earn(n) {
  if (!(n > 0)) return;
  const was = rankOf(rp()); store.set("rp", rp() + Math.round(n)); if (run) run.rp += Math.round(n);
  const now = rankOf(rp()); if (now > was) { if (run) run.rankUp = now; if (me) { toast(t("rankUp", { r: t("rank" + now) }), "gold"); band.goal(); } }
}
function rankHtml(gain = null, up = null) {
  const p = rp(), r = rankOf(p), lo = RANK_AT[r], hi = RANK_AT[r + 1];
  return `${up != null ? `<div class="rankUp">${t("rankUp", { r: t("rank" + up) })}</div>` : ""}<div class="rankTop"><b>${t("rank" + r)}</b><span>${gain != null ? t("rankGain", { n: fmt(gain) }) + " · " : ""}${t("rankHave", { n: fmt(p) })}</span></div>
    <div class="bar"><i style="width:${hi ? clamp((p - lo) / (hi - lo) * 100, 3, 100).toFixed(0) : 100}%"></i></div><small>${hi ? t("rankNext", { n: fmt(hi - p), r: t("rank" + (r + 1)) }) : t("rankTop")}</small>`;
}
// Three quests a day, picked from this pool by the date. n is the target, rp the reward in rank points.
const QUESTS = {
  rings: { n: 12, rp: 25 }, wins: { n: 2, rp: 40 }, bank: { n: 40, rp: 40 }, crown: { n: 1, rp: 60 }, streak: { n: 2, rp: 40 }, ceiling: { n: 1, rp: 20 }, arcs: { n: 4, rp: 30 },
  echo: { n: 1, rp: 40 }, profit: { n: 30, rp: 50 }, prize: { n: 1, rp: 30 }, storm: { n: 4, rp: 25 }, dares: { n: 2, rp: 25 }, dareWin: { n: 2, rp: 40 },
};
const today = () => params.get("day") || (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)(new Date());
function quests() {
  let q = store.get("quests", null); const day = today();
  if (!q || q.day !== day || !Array.isArray(q.list)) {
    let h = 2166136261; for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => (h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296;
    const forced = (params.get("quests") || "").split(",").filter(k => QUESTS[k]);   // test hook
    const ids = forced.length ? forced.slice(0, 3) : Object.keys(QUESTS).map(k => [rnd(), k]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]);
    q = { day, list: ids.map(id => ({ id, v: 0, done: false })) }; store.set("quests", q);
  }
  return q;
}
// Progress on one of today's quests. max: v is a best-so-far, not a count. key: count each different key once.
function quest(id, n = 1, max = false, key = null) {
  const q = quests(), e = q.list.find(x => x.id === id); if (!e || e.done) return;
  if (key != null) { e.keys ||= []; if (e.keys.includes(key)) return; e.keys.push(key); e.v = e.keys.length; }
  else e.v = max ? Math.max(e.v, n) : e.v + n;
  const need = QUESTS[id].n; if (e.v >= need) { e.v = need; e.done = true; }
  store.set("quests", q);
  if (e.done) { earn(QUESTS[id].rp); if (run) run.quests++; if (me) { toast(t("questDone", { q: t("q_" + id, { n: need }), n: QUESTS[id].rp }), "gold"); band.coin(); } }
}
function questsHtml() {
  const q = quests().list, left = new Date(); left.setHours(24, 0, 0, 0); const mins = Math.max(0, Math.round((left - Date.now()) / 60000)), when = { h: Math.floor(mins / 60), m: mins % 60 };
  return q.map(e => { const d = QUESTS[e.id]; return `<div class="quest ${e.done ? "done" : ""}"><span>${t("q_" + e.id, { n: d.n })}</span><em>${e.done ? "✓" : d.n > 1 ? `${fmt(e.v)} / ${fmt(d.n)}` : ""}</em><b>+${d.rp}</b><i style="width:${(e.v / d.n * 100).toFixed(0)}%"></i></div>`; }).join("") +
    `<p class="tiny">${t(q.every(e => e.done) ? "questAll" : "questNew", when)}</p>`;
}
const itemsCost = (list = items) => list.reduce((a, k) => a + (ITEMS[k] || 0), 0);
// The purse never blocks play: a stake it cannot cover is greyed out and the highest one it can cover is picked,
// shop items it cannot pay for are dropped, and flying free is always there.
function fitPurse() {
  if (purse() < stake) stake = STAKES.filter(v => v <= purse()).pop() ?? 0;
  while (items.length && purse() < stake + itemsCost()) items.pop();
}
// At take-off the stake leaves the purse and goes into the sky; what the shop items cost is burned.
function charge(st, list) {
  const cost = itemsCost(list); setPurse(purse() - st - cost); store.set("burnt", store.get("burnt", 0) + cost);
  items = []; store.set("items", []);
  return cost;
}

// ---------- input ----------
const keys = new Set(), stick = { x: 0, y: 0 }, tb = { boost: false };
const dead = v => Math.abs(v) < 0.14 ? 0 : Math.sign(v) * (Math.abs(v) - 0.14) / 0.86;   // a small dead zone, then proportional: half a push is half a climb
function readInput(dt) {
  if (AUTO) return botInput();
  const k = c => keys.has(c) ? 1 : 0, up = k("KeyW") || k("ArrowUp") || k("Space"), down = k("KeyS") || k("ArrowDown");
  return {
    turn: clamp(k("KeyA") + k("ArrowLeft") - k("KeyD") - k("ArrowRight") - dead(stick.x), -1, 1),
    climb: up ? 1 : down ? -1 : -dead(stick.y),                                   // W and S are all the way up and down; the stick is as much as it is pushed
    throttle: k("ShiftLeft") || k("ShiftRight") || tb.boost ? 1 : 0,             // cruise is automatic; Shift is the boost
  };
}
const dueling = () => D && !D.done;
addEventListener("keydown", e => {
  if ($("hud").hidden || $("log").open || $("guide").open) return;
  if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); if (!e.repeat) setPause(!(paused || menu)); return; }
  if (paused || menu) { if (e.code === "Enter") { e.preventDefault(); setPause(false); } return; }
  if (dueling()) { if (["Space", "KeyF", "KeyJ", "Enter"].includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); } return; }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if ((e.code === "KeyE" || e.code === "Enter") && !e.repeat) { act(); return; }
  if (e.code === "KeyQ" && !e.repeat) { waveOff(); return; }
  keys.add(e.code);
});
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
// A press that still works while another finger holds the stick. A browser only makes a "click" out of a lone tap,
// so these act on the press itself; a click with no pointer behind it (the keyboard) works as before.
function onTap(el, fn) {
  el.addEventListener("pointerdown", e => { if (e.button) return; e.preventDefault(); fn(e); });
  el.addEventListener("click", e => { if (e.detail === 0) fn(e); });
}
// The stick. It has a home at the bottom left, and on a touch screen it also appears wherever a thumb lands in the
// lower left half of the sky. Up climbs, down dives, sideways turns.
const stickEl = $("stick"), knob = stickEl.firstElementChild; let stickId = null, stickC = null;
function stickMove(e) { stick.x = clamp((e.clientX - stickC.x) / 46, -1, 1); stick.y = clamp((e.clientY - stickC.y) / 46, -1, 1); knob.style.translate = `${stick.x * 34}px ${stick.y * 34}px`; }
function stickStart(e, float) {
  stickId = e.pointerId;
  if (float) { stickEl.classList.add("float"); stickEl.style.left = `${e.clientX - 60}px`; stickEl.style.top = `${e.clientY - 60}px`; stickC = { x: e.clientX, y: e.clientY }; }
  else { const b = stickEl.getBoundingClientRect(); stickC = { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
  stickMove(e);
}
function stickEnd() { stickId = null; stick.x = stick.y = 0; knob.style.translate = "0 0"; stickEl.classList.remove("float"); stickEl.style.left = stickEl.style.top = ""; }
stickEl.addEventListener("pointerdown", e => { e.preventDefault(); stickEl.setPointerCapture(e.pointerId); stickStart(e, false); });
stickEl.addEventListener("pointermove", e => { if (e.pointerId === stickId) stickMove(e); });
for (const ev of ["pointerup", "pointercancel"]) stickEl.addEventListener(ev, e => { if (e.pointerId === stickId) stickEnd(); });
$("tBoost").addEventListener("pointerdown", e => { e.preventDefault(); tb.boost = true; });
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) $("tBoost").addEventListener(ev, () => tb.boost = false);
// The sky itself: in a fight any press is a beat. Otherwise one finger (or the mouse) looks around, two fingers pinch
// to zoom, the wheel zooms, and a thumb in the lower left brings the stick.
let drag = null; const looks = new Map(); let pinch = null;
function bindCanvas(cv) {   // joining a sky builds a new world on a new canvas, so the canvas listeners can be put on again
  cv.addEventListener("pointerdown", e => {
    if (dueling()) { e.preventDefault(); press(); return; }
    cv.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch" && me && !paused && !menu && stickId == null && !looks.size && e.clientX < innerWidth * 0.5 && e.clientY > innerHeight * 0.3) { stickStart(e, true); return; }
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = true;
    if (looks.size === 2 && view) { const [a, b] = [...looks.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: view.dist }; }
  });
  cv.addEventListener("pointermove", e => {
    if (e.pointerId === stickId) { stickMove(e); return; }
    const p = looks.get(e.pointerId); if (!p || !view) return;
    if (looks.size === 1) { view.camYaw -= (e.clientX - p.x) * 0.006; view.camLift = clamp(view.camLift + (e.clientY - p.y) * 0.003, -0.25, 0.7); }
    p.x = e.clientX; p.y = e.clientY;
    if (looks.size === 2 && pinch) { const [a, b] = [...looks.values()]; view.dist = clamp(pinch.dist * pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1), 11, 36); }   // fingers apart: closer
  });
  for (const ev of ["pointerup", "pointercancel"]) cv.addEventListener(ev, e => { if (e.pointerId === stickId) { stickEnd(); return; } looks.delete(e.pointerId); pinch = null; drag = looks.size ? true : null; });
  cv.addEventListener("wheel", e => { e.preventDefault(); if (view) view.dist = clamp(view.dist + Math.sign(e.deltaY) * 2, 11, 36); }, { passive: false });
}
bindCanvas($("world"));
$("laneWrap").addEventListener("pointerdown", e => { e.preventDefault(); press(); });
$("duel").addEventListener("pointerdown", e => { e.preventDefault(); press(); });   // in a fight the whole screen is the drum
onTap($("prompt"), () => act());
onTap($("promptNo"), () => waveOff());

// ---------- taking off and landing ----------
async function takeOff() {
  band.ensure(); fitPurse();
  if (role === "guest") {   // the host puts my dragon in its sky and answers with "go"; the stake leaves the purse then
    if (!going && NET?.connected) { going = true; setTimeout(() => going = false, 4000); NET.toHost({ type: "up", f: packFriend(myFriend), kind: myKind, stake, items, name: myName(), rank: rankOf(rp()), ...xOut() }); }
    return;
  }
  for (const r of world.riders.filter(x => x.mine)) world.leave(r);
  clearFriend(myFriend);
  me = world.addRider(myFriend, stake, true, myKind, items); me.mine = true; me.name = myName(); me.rank = rankOf(rp()); me.xh = myHandle(); me.xok = !!xUser;
  const cost = charge(stake, me.items);
  if (role === "host") { NET.cast({ type: "add", r: [row(me)] }); sendPeople(); }
  else t0 = band.now;                                              // a shared sky keeps one song clock from the moment it opens
  enterSky(me.start, cost);
}
// nobody else rides your Friend (one that is in the middle of a fight finishes it first)
function clearFriend(f) { for (const r of world.riders.filter(x => !x.human && x.f.id === f.id && x.state === "fly")) world.leave(r); }
function enterSky(start, shop) {
  run = { start, shop, rings: 0, ringN: 0, won: 0, lost: 0, draws: 0, taken: 0, given: 0, burned: 0, dareWon: 0, dareLost: 0, fights: [], rp: 0, rankUp: null, quests: 0, best: 0, streak: 0, head: me.items.includes("start"), climbT: 0, diveT: 0, liftT: 0 };
  store.set("flown", true);
  coach = AUTO || store.get("coach", null) === "done" ? null : (c => Array.isArray(c) && c.length === 5 ? c : [false, false, false, false, false])(store.get("coach", null));
  band.intense = false; band.play(t0);
  paused = false; menu = false; landing = null; going = false; D = null; wheel = null; hadShield = false; flapPh = Math.floor((me.flap - Math.PI / 2) / (Math.PI * 2)); view.camYaw = 0; view.first = false;
  for (const id of ["club", "splash", "result", "pause", "duel", "wheel", "callout", "eventPill", "coach"]) $(id).hidden = true;
  $("hud").hidden = false; $("laneWrap").classList.remove("on"); $("tags").hidden = false;
  $("hint").innerHTML = t(online() ? "hintSky" : "hint"); $("tags").innerHTML = ""; tags.clear(); $("toasts").innerHTML = ""; $("chips").innerHTML = ""; shown = chipsShown = ""; boardAt = 0; pauseLabels();
  if (world.event) announce(world.event, true);
  view.resize(); sizeLane();
}
function land(why, by = null) {
  if (!me || landing) return;
  if (role === "guest" && NET?.connected) {   // the host takes my dragon out of its sky and says what it carried
    const l = landing = { why, by }; NET.toHost({ type: "land" });
    setTimeout(() => { if (landing === l && me) landed(why, by, me.stake); }, 3000);
    return;
  }
  const away = why !== "bank" && !world.canLand(me), home = role === "guest" ? (away ? Math.min(me.start, me.stake) : me.stake) : world.leave(me, away);   // away from the Roost only what was brought is kept
  landed(why, by, home);
  if (role === "host") sendPeople();
}
function landed(why, by, home) {
  setPurse(purse() + home); run.had = wheel?.carry ?? me.stake;
  const net = home - run.start;
  if (why === "bank") {   // only a landing at the Roost counts for rank and quests
    earn(Math.max(0, net)); quest("bank", home, true); quest("profit", net, true);
    if (coach) { coach[4] = true; store.set("coach", coach.every(Boolean) ? "done" : coach); }
  }
  lastRun = { ...run, home, why, seed: world.seedHex, sky: online(), pool: world.pool };
  if (role === "guest") { world.remove(me); byId.delete(me.id); }
  me = null; D = null; wheel = null; paused = false; menu = false; landing = null; band.setWind(0); band.stop(); band.intense = false; band.ctx?.resume();
  $("hud").hidden = true; $("result").hidden = false; $("resNet").hidden = true;
  $("resKicker").textContent = t({ bank: "kBank", out: "kOut", closed: "kClosed", lost: "kLost", away: "kAway" }[why] || "kQuit");
  $("resHead").textContent = why === "out" ? t("hOut") : net > 0 ? t("hTook", { n: fmt(net) }) : net < 0 ? t("hLeft", { n: fmt(-net) }) : home > 0 ? t("hEven") : t("hFree");
  const back = Math.max(0, (run.had ?? home) - home);
  $("resSub").textContent = back > 0 && why !== "out" ? t("sAway", { n: fmt(home), b: fmt(back) }) : why === "out" ? t(by?.dare ? "sOutDare" : "sOut", { who: by?.dare || by || "" }) : run.start || home ? t("sBank", { s: fmt(run.start), n: fmt(home) }) : t("sBank0");
  $("resRank").innerHTML = rankHtml(run.rp, run.rankUp);
  // only the rows with something in them, and always what was landed, the pool and the purse
  const rows = [["stStart", `${fmt(run.start)} RF`, run.start], ["stRings", pm(run.rings, "+"), run.rings], ["stWon", run.won, run.won], ["stLost", run.lost, run.lost], ["stDraw", run.draws, run.draws], ["stBest", run.best, run.best >= 2], ["stTaken", pm(run.taken, "+"), run.taken], ["stGiven", pm(run.given, "−"), run.given],
    ["stDare", `${pm(run.dareWon, "+")} / ${pm(run.dareLost, "−")}`, run.dareWon || run.dareLost], ["stBurn", `${fmt(run.burned)} RF`, run.burned], ["stShop", `${fmt(run.shop)} RF`, run.shop], ["stHome", `${fmt(home)} RF`, true], ["stPool", `${fmt(lastRun.pool)} RF`, true], ["stPurse", `${fmt(purse())} RF`, true]];
  $("resStats").innerHTML = rows.filter(r => r[2]).map(([k, v]) => `<dt>${t(k)}</dt><dd>${v}</dd>`).join("");
  renderShare();
  if (why === "bank" && net > 0) band.goal(); else band.bell();
  renderSetup(); $("againBtn").focus();
}
// E: take a monster's dare, land if you are inside the Roost's light, or fight whoever is in reach
function act() {
  if (!me || me.state !== "fly" || paused || menu || landing || wheel) return;
  if (world.dareFor(me)) { if (role === "guest") NET.toHost({ type: "dare", yes: true }); else world.acceptDare(me); return; }
  if (world.canLand(me)) { land("bank"); return; }
  const o = world.near(me); if (!o) return;
  if (role !== "guest") world.challenge(me, o);
  else if (performance.now() > actAt) { actAt = performance.now() + 400; NET.toHost({ type: "fight", id: o.id }); }   // the host decides whether the fight starts
}
// Q: wave a dare off. Flying away or letting it run out does the same.
function waveOff() {
  if (!me || !world.dareFor(me)) return;
  if (role === "guest") NET.toHost({ type: "dare", yes: false }); else world.declineDare(me);
}

// ---------- the fight: two rounds of call and response ----------
// A fight against a computer rider is played out on this device. A fight between two players (opt.pvp) runs on both
// devices off the same beat: each judges its own taps and sends them, and the host's device decides the rounds and the coins.
function startDuel(a, b, opt = {}) {
  const beat = songT() / SPB;
  D = { fid: opt.fid || 0, pvp: !!opt.pvp, riders: [a, b], mine: a === me ? 0 : 1, round: 0, b0: opt.b0 ?? Math.ceil(beat) + LEAD + 1, hits: [0, 0], rounds: [], ring: opt.ring || a.ring, cur: null, done: false, sent: false, lastBeat: null, risk: [a.stake, b.stake] };
  band.intense = true; band.horn(); keys.clear(); landing = null;
  if (menu) { menu = false; $("pause").hidden = true; pauseLabels(); }
  for (const p of [0, 1]) { $("dAva" + p).innerHTML = ""; $("dAva" + p).append(avatar(D.riders[p].f, "")); $("dName" + p).textContent = nameOf(D.riders[p]); $("dS" + p).textContent = 0; }
  $("dRule").textContent = t("rule", { l: fmt(world.spoilsOf(me).amount), w: fmt(world.spoilsOf(D.riders[1 - D.mine]).gain) });   // from my side: what I lose, what I win
  $("duel").classList.toggle("mine1", D.mine === 1);
  $("duel").hidden = false; $("laneWrap").classList.add("on"); $("tags").hidden = true; $("prompt").hidden = $("promptNo").hidden = $("eventPill").hidden = true; shown = ""; $("hint").innerHTML = t("hintDuel");
  newRound();
  say(t("fight"), `${nameOf(a)} vs ${nameOf(b)}`, "gold", SPB * 1000);
}
function newRound() {
  const caller = D.round, rider = D.riders[caller];
  D.cur = { caller, call: [], resp: [], extra: 0, extraMarks: [], pulse: [0, 0], cpu: {}, over: false, echoAt: -9, b0: D.b0 + D.round * (ROUND + LEAD) };
  if (caller !== D.mine && !D.pvp) D.cur.cpu.calls = planCall(rider.skill);
  $("dRound").textContent = t("round", { n: D.round + 1 });
  for (const p of [0, 1]) { $("dRole" + p).textContent = t(p === caller ? "roleCall" : "roleEcho"); $("dRole" + p).className = "dRole " + (p === caller ? "call" : ""); }
}
// A computer rider's call: better riders tap more, and put more of it between the beats.
function planCall(skill) {
  const r = world.rng, n = 3 + Math.floor(skill * 3.2 + r() * 1.6), times = [];
  const slots = [0, 2, 4, 6, 1, 3, 5, 7].sort((a, b) => (a % 2) * (1.2 - skill) + r() * 0.8 - ((b % 2) * (1.2 - skill) + r() * 0.8));
  for (const k of slots.slice(0, Math.min(7, n))) times.push(clamp(k * 0.5 + (skill > 0.55 ? (r() - 0.5) * 0.3 * skill : 0), 0, CALL - 0.2));
  return times.sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] >= 0.3);
}
function press() {
  if (!dueling() || paused) return;
  const c = D.cur, b = songT() / SPB - c.b0;
  if (c.over) return;
  if (c.caller === D.mine && b > -0.3 && b < CALL - 0.1) callTap(b, true);
  else if (c.caller !== D.mine && b > ECHO0 - 0.3 && b < ROUND - 0.1) {
    if (b - c.echoAt < 0.12) return;                                // a second finger landing with the first is one tap, not a stray one
    c.echoAt = b; echoTap(b - ECHO0, true);
  } else band.tap();
}
// Back from the background in the middle of a round (alone, the sky was paused): the same round again, from its 3-2-1.
function restartRound() { D.b0 = Math.ceil(songT() / SPB) + LEAD - D.round * (ROUND + LEAD); D.lastBeat = null; newRound(); }
// The call is free: every tap is stamped exactly where it lands. The echo has to land near each of those taps.
function callTap(b, mine) {
  const c = D.cur, x = clamp(b, 0, CALL - 0.05);
  if (c.call.length >= MAX_TAPS || c.call.some(y => Math.abs(y - x) < MIN_GAP)) { if (mine) band.tap(); return; }
  c.call.push(x); c.call.sort((a, z) => a - z); c.resp = c.call.map(() => 0);
  if (mine && D.pvp) tapOut({ type: "call", fid: D.fid, b: x });
  band.strike("good"); c.pulse[0] = 1;
  view.shot(D.riders[c.caller], D.riders[1 - c.caller], c.caller === D.mine ? "#ffd24a" : "#ff6a4d");   // every call tap is a bolt of fire
}
// Which call tap an echo tap answers. Inside the tolerance it answers it cleanly. Outside it, but within LATE of a
// tap nobody has answered yet, it answers that tap late: one hit for the caller, not a miss and a stray as well.
// A stray is only a tap with no unanswered call tap near it. The same rule on every device and on the host.
const LATE = 0.3;
function matchEcho(call, resp, rel, tol) {
  const near = lim => { let i = -1, best = lim; call.forEach((y, k) => { const e = Math.abs(y - rel); if (!resp[k] && e <= best) { best = e; i = k; } }); return i; };
  const i = near(tol); if (i >= 0) return { i, late: false };
  const j = near(LATE); return { i: j, late: j >= 0 };
}
function echoTap(rel, mine, forced = null, late = false) {
  const c = D.cur; let i = forced;
  if (forced == null) ({ i, late } = matchEcho(c.call, c.resp, rel, TOL[lvl()]));
  if (mine && D.pvp) tapOut({ type: "echo", fid: D.fid, rel });
  if (i >= 0 && !c.resp[i]) { c.resp[i] = late ? 2 : 1; if (late) band.miss(); else band.steal(); c.pulse[1] = 1; }
  else { c.extra++; band.miss(); c.extraMarks.push(clamp(rel, -0.25, CALL)); }
}
// resp: 1 answered, 2 answered late, 0 missed. Every miss, every late answer and every stray tap is a hit for the caller.
function judge(c) {
  const n = c.call.length, hit = c.resp.filter(x => x === 1).length, late = c.resp.filter(x => x === 2).length, missed = n - hit - late;
  return { n, missed, late, hits: n < 3 ? 0 : missed + late + c.extra };
}
function resolveRound() {
  const c = D.cur, j = judge(c), echo = 1 - c.caller;
  c.over = true; D.hits[c.caller] += j.hits;
  D.rounds.push({ caller: c.caller, call: [...c.call], resp: [...c.resp], extra: c.extra });
  $("dS" + c.caller).textContent = D.hits[c.caller];
  const good = c.caller === D.mine ? j.hits > 0 : j.hits === 0;
  if (j.n < 3) say(t("rWeak"), t("rWeakSub", { n: j.n }), good ? "gold" : "red", SPB * 900);
  else say(j.hits === 0 ? t("rBlocked") : j.hits === 1 ? t("rHit1") : t("rHits", { n: j.hits }), t("rSub", { who: nameOf(D.riders[echo]), m: j.missed, l: j.late, x: c.extra }), good ? "gold" : "red", SPB * 900);
  if (j.hits) band.crowd(1, 0.2); else band.bell();
}
function finishDuel() {
  if (D.sent) return; D.sent = true;
  if (role === "guest") { NET.toHost({ type: "result", fid: D.fid, rounds: D.rounds }); return; }   // the host recounts the hits and moves the coins
  const [a, b] = D.riders, w = D.hits[0] > D.hits[1] ? 0 : D.hits[1] > D.hits[0] ? 1 : -1;
  showResult(w, w < 0 ? world.settle(a, b, true) : world.settle(D.riders[w], D.riders[1 - w]));
}
// out: what moved, as the World (here or on the host) settled it. why "left": the other rider left, a forfeit.
function showResult(w, out, why = "") {
  D.done = true;
  const other = D.riders[1 - D.mine], who = nameOf(other);
  const rec = { who, fid: D.fid, pvp: D.pvp, ids: D.riders.map(r => r.id), rounds: D.rounds, mine: D.mine, hits: [...D.hits], result: w < 0 ? "draw" : w === D.mine ? "won" : "lost", amount: out.amount, burn: out.burn, gain: out.gain, crown: !!out.crown, insured: !!out.insured, share: out.share || 0, forfeit: why === "left" && w >= 0 };
  run.fights.push(rec);
  if (rec.result === "won") {
    run.won++; run.taken += out.gain; run.burned += out.burn; run.streak++;
    earn(out.crown ? 40 : 20); quest("wins"); if (out.crown) quest("crown"); quest("streak", run.streak, true);
    if (D.rounds.some(c => c.caller !== D.mine && c.call.length >= 3 && c.extra === 0 && c.resp.every(Boolean))) quest("echo");
    say(t("won", { g: fmt(out.gain) }), t(rec.forfeit ? "forfeit" : out.crown && !out.insured ? "wonCrown" : "wonSub", { a: fmt(out.amount), who, b: fmt(out.burn) }), "gold", 2400); band.goal(); view.coins(other, me, out.amount);
  } else if (rec.result === "lost") {
    run.lost++; run.given += out.amount; run.burned += out.burn; run.streak = 0;
    say(t("lost", { a: fmt(out.amount) }), t(out.insured ? "lostInsured" : out.crown ? "lostCrown" : "lostSub", { who }), "red", 2400); band.conceded(); view.coins(me, other, out.amount);
  } else { run.draws++; say(t("draw"), t("drawSub", { who }), "", 2000); band.bell(); }
  band.intense = false; bump();
  const mine = me, d = D;
  setTimeout(() => {
    if (me !== mine || D !== d) return;
    D = null; $("duel").hidden = true; $("laneWrap").classList.remove("on"); $("tags").hidden = false; $("hint").innerHTML = t(online() ? "hintSky" : "hint");
    if (rec.result === "won" && out.gain > 0) shareToast(t("tWon", { n: fmt(out.gain), who }), t(out.crown && !out.insured ? "mCrown" : "mFight", { n: fmt(out.gain), who: plainAt(who) }));
    if (me.stake < 1 && run.start > 0 && rec.result === "lost") land("out", who);   // only a rider who brought a stake can be knocked out; a free flyer robbed back to nothing keeps flying
  }, 1700);
}
function duelUpdate(dt) {
  if (D.done) return;
  const beat = songT() / SPB;
  if (D.cur.over && D.round === 0 && beat - D.cur.b0 >= ROUND + 1) { D.round = 1; newRound(); }
  const c = D.cur, b = beat - c.b0, echo = 1 - c.caller;
  if (c.cpu.calls) c.cpu.calls.forEach((x, k) => { const key = "c" + k; if (!c.cpu[key] && b >= x) { c.cpu[key] = 1; callTap(x, false); } });
  // the rhythm laid out: during the second 3-2-1 the call plays back, one tap at a time
  if (b >= CALL && b < ECHO0) c.call.forEach((x, k) => { const key = "r" + k; if (!c[key] && b >= CALL + x) { c[key] = 1; band.hoof(band.now, 1.3); } });
  if (echo !== D.mine && !D.pvp && b >= ECHO0) {
    const off = c.call.filter(x => Math.abs(x - Math.round(x)) > 0.2).length;
    const form = clamp(0.66 + D.riders[echo].skill * 0.26 + CPU_LEVEL[level] - off * 0.06, 0.3, 0.97);   // off-beats are hard to echo
    c.call.forEach((x, k) => {
      const key = "e" + k; if (c.cpu[key] || b < ECHO0 + x) return; c.cpu[key] = 1;
      if (world.rng() < form) echoTap(x, false, k); else if (world.rng() < 0.2) echoTap(x + 0.3, false, -1);   // a slip: sometimes a stray tap, sometimes no tap at all
    });
  }
  if (AUTO) {   // test bot plays my side
    if (c.caller === D.mine) { c.bot ||= [0, 0.5, 1.5, 2.25, 3]; c.bot.forEach((x, k) => { const key = "bc" + k; if (!c[key] && b >= x) { c[key] = 1; press(); } }); }
    else if (b >= ECHO0) c.call.forEach((x, k) => { const key = "be" + k; if (c[key]) return; if (c[key + "m"] ??= Math.random() < BOT_MISS) { c[key] = 1; return; } if (b >= ECHO0 + x + (c[key + "j"] ??= (Math.random() - 0.5) * 0.12)) { c[key] = 1; press(); } });
  }
  c.pulse = c.pulse.map(x => Math.max(0, x - dt * 4));
  const fb = Math.floor(beat);
  if (fb !== D.lastBeat) {   // 3-2-1 before the call, and again before the echo
    D.lastBeat = fb;
    const rb = fb - c.b0, lead = rb >= -3 && rb < 0, gap = rb > CALL && rb < ECHO0, p = lead || rb < CALL ? c.caller : echo, who = nameOf(D.riders[p]), tone = p === D.mine ? "gold" : "";
    const tell = k => tk(p === D.mine ? k + "Me" : k, { who });
    if (lead || gap) { band.count(1); say(String(lead ? -rb : ECHO0 - rb), tell(lead ? "getCall" : "getEcho"), tone, SPB * 1000); }
    if (rb === 0) { band.count(0); band.fire(0.45); say(t("goCall"), tell("getCall"), tone, SPB * 800); }
    if (rb === CALL) say(t(p === D.mine ? "turnEchoMe" : "turnEcho", { who: who.toUpperCase() }), tell("getEcho"), tone, SPB * 1000);
    if (rb === ECHO0) { band.count(0); say(t("goEcho"), tell("getEcho"), tone, SPB * 800); }
  }
  if (!c.over && !D.pvp && b >= ROUND + 0.25) resolveRound();
  if (c.over && !D.pvp && D.round === 1 && b >= ROUND + 1.6) finishDuel();
}

// The fight board: two rows over the same four beats. The call is tapped on the top row, stays laid out,
// and the echo is tapped on the bottom row right under it. A playhead sweeps each row in turn.
let lw = 0, lh = 0;
const lctx = $("lane").getContext("2d");
function sizeLane() {
  const cv = $("lane"), b = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr); lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lw = b.width; lh = b.height;
}
function drawLane() {
  const ctx = lctx; if (!lw || !D) return;
  ctx.clearRect(0, 0, lw, lh);
  const c = D.cur, b = songT() / SPB - c.b0, st = c.caller, kt = 1 - st, mineRow = "#1d3257", theirRow = "#4a3a30";
  const pad = lw < 600 ? 10 : 24, x0 = pad, bw = (lw - pad * 2) / (CALL + 0.3), mid = lh / 2;
  const bx = beat => x0 + (beat + 0.3) * bw;
  const yC = mid * 0.62, yE = mid + mid * 0.62, Rr = Math.min(14, bw * 0.15, mid * 0.24), big = lh >= 170;   // a taller board (a phone) gets bigger taps and words
  const phase = c.over ? 4 : b < 0 ? 0 : b < CALL ? 1 : b < ECHO0 ? 2 : 3;   // 3-2-1, call, rhythm laid out + 3-2-1, echo, settled
  ctx.globalAlpha = 0.6; ctx.fillStyle = st === D.mine ? mineRow : theirRow; ctx.fillRect(0, 0, lw, mid - 1); ctx.fillStyle = kt === D.mine ? mineRow : theirRow; ctx.fillRect(0, mid + 1, lw, mid - 1); ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff12"; if (phase <= 1) ctx.fillRect(0, 0, lw, mid - 1); if (phase === 2 || phase === 3) ctx.fillRect(0, mid + 1, lw, mid - 1);
  const n321 = x => Math.min(3, Math.ceil(x));
  const topNote = phase === 0 ? (b >= -3 ? n321(-b) : t("ready")) : phase === 1 ? tk(st === D.mine ? "callNow" : "listen") : "";
  const botNote = phase === 2 ? (b >= CALL + 1 ? `${t("laidOut")} · ${n321(ECHO0 - b)}` : t("laidOut")) : phase === 3 ? tk(kt === D.mine ? "echoNow" : "watch") : "";
  ctx.font = `800 ${big ? 13 : 11}px Inter, 'Noto Sans KR'`; ctx.textAlign = "left";
  ctx.fillStyle = topNote ? "#ffd24a" : "#f4efe3aa"; ctx.fillText(t("callTrack", { who: nameOf(D.riders[st]) }) + (topNote ? ` · ${topNote}` : ""), x0, 13);
  ctx.fillStyle = botNote ? "#ffd24a" : "#f4efe3aa"; ctx.fillText(t("echoTrack", { who: nameOf(D.riders[kt]) }) + (botNote ? ` · ${botNote}` : ""), x0, mid + 14);
  for (let k = 0; k <= CALL * 2; k++) { ctx.fillStyle = k % 2 ? "#ffffff0d" : "#ffffff24"; ctx.fillRect(bx(k / 2), 18, 1, mid - 22); ctx.fillRect(bx(k / 2), mid + 19, 1, mid - 22); }   // a ruler, not targets
  const vis = phase === 3 && lvl() === "pro" ? clamp(1 - (b - ECHO0) / 1.2, 0, 1) : 1;   // on Pro the laid-out rhythm fades once the echo starts
  c.call.forEach((x, k) => {
    const px = bx(x), lit = phase === 2 && b - CALL >= x && b - CALL < x + 0.4;
    ctx.fillStyle = lit ? "#fff1cf" : "#ffd24a"; ctx.beginPath(); ctx.arc(px, yC, lit ? Rr * 1.25 : Rr, 0, Math.PI * 2); ctx.fill();
    if (phase >= 2 && vis > 0) {
      ctx.globalAlpha = (c.over ? 1 : vis) * 0.35; ctx.fillStyle = "#ffd24a"; ctx.fillRect(px - 1, yC + Rr, 2, yE - yC - Rr * 2); ctx.globalAlpha = 1;
      if (!c.resp[k] && phase < 4) { ctx.globalAlpha = vis * 0.7; ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, yE, Rr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (c.resp[k]) { ctx.fillStyle = c.resp[k] === 2 ? "#ffb15c" : "#9fb7ee"; /* a late answer in its own colour */ ctx.beginPath(); ctx.arc(px, yE, Rr, 0, Math.PI * 2); ctx.fill(); }
    if (c.over && !c.resp[k]) { ctx.strokeStyle = "#ff7a7a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, yE, Rr, 0, Math.PI * 2); ctx.stroke(); }
  });
  const cross = (x, y) => { ctx.strokeStyle = "#ff7a7a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); };
  c.extraMarks.forEach(w => cross(bx(w), yE));
  if (phase >= 1 && phase <= 3) {
    const rel = phase === 1 ? b : phase === 2 ? b - CALL : b - ECHO0, x = bx(rel), y0 = phase < 3 ? 18 : mid + 19;
    ctx.fillStyle = phase === 2 ? "#ffffff77" : "#fff"; ctx.fillRect(x - 1.5, y0, 3, mid - 22); ctx.beginPath(); ctx.arc(x, y0, 5, 0, Math.PI * 2); ctx.fill();
  }
  c.pulse.forEach((v, p) => { if (v <= 0) return; const y = p ? yE : yC, x = bx(clamp(p ? b - ECHO0 : b, 0, CALL)); ctx.strokeStyle = `rgba(255,210,74,${v})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, Rr + (1 - v) * 18, 0, Math.PI * 2); ctx.stroke(); });
}

// ---------- a monster's dare: the wheel ----------
// The roll was already made by the world (here, or on the host) and the coins have moved. The wheel only shows it,
// honestly: the slices are as wide as their chances, and the same odds are listed beside it.
const WHEEL_COL = ["#ffd24a", "#f0a63c", "#e7c97a", "#7f8da3", "#c8685a", "#94342f"], WHEEL_TAG = ["ALL", "1/2", "1/4", "0", "−1/4", "−1/2"];
function oddsRows(h = null, c = null) {
  return `<tr><th>${t("dChance")}</th><th>${t("dOutcome")}</th>${h != null ? `<th>${t("dNow")}</th>` : ""}</tr>` + DARE.map((o, k) => {
    const now = o.take ? `+${fmt(spoils(h, o.take).gain)} RF` : o.give ? (c > 0 ? `−${fmt(spoils(c, o.give).amount)} RF` : t("dNothing")) : "0 RF";
    return `<tr data-k="${k}"><td><i style="background:${WHEEL_COL[k]}"></i>${Math.round(o.p * 100)}%</td><td>${t("d" + k)}</td>${h != null ? `<td>${now}</td>` : ""}</tr>`;
  }).join("");
}
function startWheel(e) {   // e: { kind, k, dir, amount, burn, gain, hoard0, carry0 }
  const who = t("m_" + e.kind), w = wheel = { e, carry: e.carry0 };
  quest("dares"); keys.clear();
  let a = 0; const stops = [], labels = [];
  DARE.forEach((o, k) => {   // the disc stands still, so every label stays upright; the needle is what turns
    const b = a + o.p * 360, mid = (a + b) / 2 * Math.PI / 180, r = o.p < 0.12 ? 39 : 31;
    stops.push(`${WHEEL_COL[k]} ${a}deg ${b}deg`);
    labels.push(`<span class="${o.p < 0.12 ? "thin" : ""}" style="left:${(50 + Math.sin(mid) * r).toFixed(1)}%;top:${(50 - Math.cos(mid) * r).toFixed(1)}%"><b>${WHEEL_TAG[k]}</b><small>${Math.round(o.p * 100)}%</small></span>`);
    if (k === e.k) w.at = a + (0.2 + Math.random() * 0.6) * (b - a); a = b;
  });
  const disc = $("wheelDisc"), pin = $("wheelPin"); disc.style.background = `conic-gradient(${stops.join(",")})`; disc.innerHTML = labels.join("");
  $("wheelTitle").textContent = t("wheelTitle", { who }); $("wheelSub").textContent = t("wheelSub", { h: fmt(e.hoard0), c: fmt(e.carry0) });
  $("wheelOdds").innerHTML = oddsRows(e.hoard0, e.carry0); $("wheelOut").innerHTML = ""; $("wheelOut").className = "wheelOut";
  $("wheel").hidden = false; $("prompt").hidden = $("promptNo").hidden = true; shown = "";
  pin.style.transition = "none"; pin.style.transform = "rotate(0deg)"; void pin.offsetWidth;
  pin.style.transition = `transform ${SPIN_SECS - 0.5}s cubic-bezier(.12,.72,.1,1)`; pin.style.transform = `rotate(${360 * 5 + w.at}deg)`;
  band.horn();
  for (const ms of [0, 110, 230, 360, 510, 690, 900, 1150, 1450, 1820, 2300]) setTimeout(() => { if (wheel === w) band.count(1); }, ms);   // the ticks slow down with the needle
  setTimeout(() => {   // the needle has stopped: say what happened, inside the box, and write it down
    if (wheel !== w || !me) return;
    const result = e.dir > 0 ? "won" : e.dir < 0 ? "lost" : "draw";
    run.fights.push({ dare: true, kind: e.kind, k: e.k, dir: e.dir, amount: e.amount, burn: e.burn, gain: e.gain, hoard0: e.hoard0, carry0: e.carry0, result });
    run.burned += e.burn; w.carry = null;
    $("wheelOdds").querySelector(`[data-k="${e.k}"]`)?.classList.add("hit");
    const out = $("wheelOut"), show = (big, sub, cls) => { out.innerHTML = `<b>${big}</b><small>${sub}</small>`; if (cls) out.classList.add(cls); };
    if (e.dir > 0) { run.dareWon += e.gain; earn(e.k === 0 ? 30 : 10); quest("dareWin"); show(`+${fmt(e.gain)} RF`, t("dareWonSub", { a: fmt(e.amount), who, b: fmt(e.burn) }), "gold"); if (e.k === 0) band.goal(); else band.coin(); bump(); }
    else if (e.dir < 0) { run.dareLost += e.amount; show(`−${fmt(e.amount)} RF`, t("dareLostSub", { a: fmt(e.amount), who, b: fmt(e.burn) }), "red"); band.conceded(); bump(); }
    else { show(t("dareNone"), t(DARE[e.k].give ? "dareSafeSub" : "dareNoneSub", { who })); band.bell(); }
    setTimeout(() => {
      if (wheel !== w) return;
      wheel = null; $("wheel").hidden = true;
      if (e.k === 0 && e.dir > 0 && me) shareToast(t("tJack", { n: fmt(e.gain) }), t("mJack", { n: fmt(e.gain), who }));   // a jackpot is worth telling
      if (me && me.stake < 1 && run.start > 0 && e.dir < 0) land("out", { dare: who });   // only a rider who brought a stake can be knocked out
    }, 2100);
  }, SPIN_SECS * 1000);
}

// ---------- heads-up display ----------
let calloutTimer = 0;
function say(big, sub = "", tone = "", ms = 1300) {
  const el = $("callout"); el.className = "callout " + tone;
  el.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ""}`; el.hidden = false;
  clearTimeout(calloutTimer); calloutTimer = setTimeout(() => el.hidden = true, ms);
}
const heldToasts = [];
// During a fight nothing is laid over the board: what matters afterwards (gold) waits until the fight is over.
function toast(text, cls = "", now = false, link = null) {
  if (D && !now) { if (cls === "gold") heldToasts.push([text, cls, false, link]); return; }
  const el = document.createElement("div"); el.className = "toast " + cls; el.textContent = text;
  if (link) { const a = Object.assign(document.createElement("a"), { className: "xshare", href: link, target: "_blank", rel: "noopener", textContent: t("share") }); el.append(" ", a); el.classList.add("long"); }
  const box = $("toasts"); box.append(el); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), link ? 8000 : 5000);
}
// A moment worth posting: a line in the corner with a small "Share" link to X's post page. It waits out a fight like any gold toast.
const shareToast = (text, post) => toast(text, "gold", false, intentUrl(`${post}\n${xTail()}`, siteUrl()));
// The words after every post: who is playing, and the project, named once.
function xTail() { const h = myHandle(); return h && h.toLowerCase() !== PROJECT.toLowerCase() ? t("bTail", { h, p: PROJECT }) : t("bTail0", { p: PROJECT }); }
const plainAt = s => String(s).replace(new RegExp("@" + PROJECT, "ig"), PROJECT);   // a rider named after the project is not a second mention of it
function bump() { const el = document.querySelector(".card.mine"); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
const setText = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
// A world event begins: said once to everyone, and it stays on the map and in the countdown until it ends.
function announce(ev, quiet = false) {
  if (!me) return;
  const k = ev.type === "storm" ? "evStorm" : "evPrize";
  if (!quiet) { say(t(k).toUpperCase(), t(k + "Sub"), "gold", 2800); band.horn(); }
  if (quiet || !TOUCH) toast(`${t(k)}: ${t(k + "Sub")}`, "gold");   // on a phone the callout and the chip by the coins already say it
}
function crownSay(r) {
  if (!me) return;
  if (r === me) { say(t("crownYou"), t("crownYouSub"), "gold", 2400); band.bell(); } else toast(t("crownTook", { who: nameOf(r) }), "gold");
}
// I flew through a ring (this device saw it, or the host confirmed it): coins, rank and quests.
function ringMine(g, value) {
  run.rings += value; run.ringN++; band.coin(); bump(); earn(1);
  if (g?.ev === "storm") quest("storm"); else if (g?.ev === "prize") { quest("prize"); toast(t("prizeYou"), "gold"); } else { quest("rings"); if (g) quest("arcs", 1, false, g.arc); }
}
const tags = new Map();
let windN = 0, boardAt = 0, edgeAt = 0, shown = "", chipsShown = "", coachShown = -1, coachHold = 0, hudFight = false;
function hud(dt) {
  setText("stakeV", fmt(wheel?.carry ?? me.stake)); setText("purseV", fmt(purse())); setText("poolV", fmt(world.pool));
  // how high: a bar from the sea to the top of the sky, with the ground below me shaded
  const ground = Math.max(world.heightAt(me.x, me.z), 0);
  $("altMe").style.bottom = `${clamp(me.y / CEIL * 100, 0, 100).toFixed(1)}%`; $("altGround").style.height = `${clamp(ground / CEIL * 100, 0, 100).toFixed(1)}%`; setText("altV", String(Math.round(me.y)));
  // streak, crown and what was bought for this flight
  run.best = Math.max(run.best, me.streak || 0);
  if (run.head && !(me.shield > 0 && fights(run).length === 0)) run.head = false;
  const ev = world.event, evText = ev ? `${t(ev.type === "storm" ? "evStorm" : "evPrize")} · ${t("secs", { n: Math.max(0, Math.ceil(ev.until - world.t)) })}` : world.pool < 1 ? t("poolOut") : "";
  const chips = (evText ? `<i class="ev ${ev ? "" : "spent"}">${evText}</i>` : "") + (me.crowned ? `<i class="gold">♛ ${t("crownChip")}</i>` : "") + (me.streak >= 2 ? `<i class="hot">${t("streak", { n: me.streak })}</i>` : "") + (me.magnet ? `<i>${t("i_magnet")}</i>` : "") + (me.insured ? `<i>${t("i_insure")}</i>` : "") + (run.head ? `<i>${t("i_start")} ${t("secs", { n: Math.ceil(me.shield) })}</i>` : "");
  if (!!D !== hudFight) { hudFight = !!D; $("hud").classList.toggle("fight", hudFight); if (!hudFight) for (const [text, cls, , link] of heldToasts.splice(0)) toast(text, cls, false, link); }
  if (chips !== chipsShown) { chipsShown = chips; $("chips").innerHTML = chips; }
  // name tags over the other riders: what they carry is what you can take
  const alive = new Set();
  const mine = myHandle(), selfTag = tags.get("self") || (() => { const el = document.createElement("div"); el.className = "tag self"; el.innerHTML = "<span></span>"; $("tags").append(el); tags.set("self", el); return el; })();
  const sp = mine && view.tag(me); alive.add("self"); selfTag.hidden = !sp;   // my own handle over my own dragon, when I gave one
  if (sp) { selfTag.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`; if (selfTag.firstChild.textContent !== "@" + mine) selfTag.firstChild.textContent = "@" + mine; selfTag.classList.toggle("xok", !!xUser); }
  for (const r of world.riders) {
    if (r === me) continue; alive.add(r.id);
    let el = tags.get(r.id); if (!el) { el = document.createElement("div"); el.className = r.human ? "tag human" : "tag"; el.innerHTML = "<b></b><span></span>"; $("tags").append(el); tags.set(r.id, el); }
    const p = view.tag(r); if (!p) { el.hidden = true; continue; }
    el.hidden = false; el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    const txt = `${fmt(r.stake)} RF${r.streak >= 2 ? ` ×${r.streak}` : ""}`, name = nameOf(r) + (r.human && r.rank != null ? ` · ${t("rank" + r.rank)}` : "");
    if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt; if (el.lastChild.textContent !== name) el.lastChild.textContent = name;
    el.classList.toggle("hunt", r.goal?.rider === me); el.classList.toggle("top", !!r.crowned); el.classList.toggle("xok", !!(r.xh && r.xok)); el.classList.toggle("far", p.d > 190); el.classList.toggle("away", !!r.away);
  }
  // monsters: their hoard, and what they say when they fly up to someone
  for (const m of world.monsters) {
    const id = "m" + m.id; alive.add(id);
    let el = tags.get(id); if (!el) { el = document.createElement("div"); el.className = "tag monster"; el.innerHTML = "<q hidden></q><b></b><span></span>"; $("tags").append(el); tags.set(id, el); }
    const p = view.monsterTag ? view.monsterTag(m) : view.tag(m); if (!p || m.state === "flee") { el.hidden = true; continue; }
    el.hidden = false; el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    const txt = `${fmt(m.hoard)} RF`, talk = (m.state === "taunt" || m.state === "dare") && (m.target === me || p.d < 120) ? lineOf(m) : "", q = el.firstChild;
    if (q.nextSibling.textContent !== txt) { q.nextSibling.textContent = txt; el.lastChild.textContent = t("m_" + m.kind); }
    if (q.textContent !== talk) { q.textContent = talk; q.hidden = !talk; }
    el.classList.toggle("far", p.d > 190 && !talk); el.classList.toggle("dare", m.state === "dare" && m.target === me);
  }
  for (const [id, el] of tags) if (!alive.has(id)) { el.remove(); tags.delete(id); }
  // what E does right now
  let html = "", no = "";
  if (me.state === "fly" && !dueling() && !wheel && !landing) {
    const dare = world.dareFor(me), o = dare ? null : world.near(me);
    if (dare) { html = `${tk("pDare", { who: t("m_" + dare.kind) })}<small>${t("pDareSub", { h: fmt(dare.hoard), c: fmt(me.stake), s: Math.max(0, Math.ceil(dare.dareUntil - world.t)) })}</small>`; no = tk("pDareNo"); }
    else if (world.canLand(me)) html = me.stake > 0 ? `${tk("pBank", { n: fmt(me.stake) })}<small>${t("pBankSub")}</small>` : `${tk("pLand")}<small>${t("pLandSub")}</small>`;
    else if (o) { const win = world.spoilsOf(o), lose = world.spoilsOf(me); html = `${tk("pFight", { who: nameOf(o) })}<small>${t(win.crown && !win.insured ? "pFightCrown" : "pFightSub", { g: fmt(win.gain), l: fmt(lose.amount) })}</small>`; }
    else {   // someone is in reach but E would do nothing: say why
      const x = world.riders.filter(r => r !== me && r.state === "fly" && !world.safe(r)).map(r => ({ r, d: Math.hypot(r.x - me.x, r.y - me.y, r.z - me.z) })).filter(v => v.d < FIGHT_RANGE).sort((a, b) => a.d - b.d)[0]?.r;
      if (x && me.stake < 1) html = `<small>${t("pNeed")}</small>`;
      else if (x && x.stake < 1) html = `<small>${t("pEmpty", { who: nameOf(x) })}</small>`;
      else if (x && x.shield > 0) html = `<small>${t("pShielded", { who: nameOf(x) })}</small>`;
      else if (me.shield > 0.2) html = `<small>${t("shield", { n: Math.ceil(me.shield) })}</small>`;
    }
  }
  if (html !== shown) { shown = html; $("prompt").innerHTML = html; $("prompt").hidden = !html; $("prompt").classList.toggle("note", html.startsWith("<small>")); $("promptNo").innerHTML = no; $("promptNo").hidden = !no; }
  if (me.edge && !run.edgeSaid) { run.edgeSaid = true; toast(t("edge")); }   // said once: why the dragon is turning
  // the event that is on, or the news that the pool is spent
  if ($("eventPill").textContent !== evText) { $("eventPill").textContent = evText; $("eventPill").hidden = !evText || !!D; $("eventPill").classList.toggle("spent", !ev); }
  coachTick(dt);
  if (performance.now() > boardAt) {
    boardAt = performance.now() + 500;
    const list = [...world.riders].sort((a, b) => b.stake - a.stake), rows = list.slice(0, 5); if (!rows.includes(me)) rows.push(me);
    setText("boardK", t("boardK", { n: fmt(world.carried) }));
    const who = r => r === me && mine ? `@${mine}${xUser ? XMARK : ""}` : nameOf(r) + (r !== me && r.xh && r.xok ? XMARK : "");   // a handle in place of "You" when I gave one
    $("board").innerHTML = rows.map(r => `<li class="${r === me ? "me" : r.human ? "human" : ""}"><span>${list.indexOf(r) + 1}. ${r.crowned ? "♛ " : ""}${who(r)}${r.streak >= 2 ? ` ×${r.streak}` : ""}</span><b>${fmt(r.stake)}</b></li>`).join("");
    drawMap();
  }
}
// First flight only: one short tip at a time, ticked off when it is done. Never over a fight or the wheel.
function coachTick(dt) {
  const el = $("coach"); if (!coach) { el.hidden = true; return; }
  if (me.pitch > 0.2) run.climbT += dt; if (me.pitch < -0.2) run.diveT += dt; if (me.lift) run.liftT += dt;
  const now = [run.climbT > 0.5 && run.diveT > 0.4, run.ringN > 0, run.liftT > 1.2, fights(run).length > 0 || !!D, false], t1 = performance.now();
  now.forEach((v, i) => { if (v && !coach[i]) { coach[i] = true; store.set("coach", coach); if (i === coachShown) coachHold = t1 + 1500; } });
  if (D || wheel) { el.hidden = true; return; }                      // never over a fight, from its first beat until its header is gone
  if (t1 < coachHold) { el.classList.add("ok"); return; }                // the tick stays up for a moment
  const i = coach.indexOf(false);
  if (i < 0) { coach = null; store.set("coach", "done"); el.hidden = true; return; }
  if (i !== coachShown || el.hidden) { coachShown = i; el.classList.remove("ok"); el.hidden = false; $("coachN").textContent = t("coachN", { a: i + 1 }); $("coachTip").innerHTML = tk("coach" + i); }
}
onTap($("coachSkip"), () => { coach = null; store.set("coach", "done"); $("coach").hidden = true; });
function drawMap() {
  const cv = $("map"), c = cv.getContext("2d"), s = 70 / (R * 1.12), mx = x => 75 - x * s, mz = z => 75 - z * s;
  c.clearRect(0, 0, 150, 150);
  world.islands.forEach((i, k) => { c.fillStyle = isleCols?.[k] || "#7bb863cc"; c.beginPath(); c.arc(mx(i.x), mz(i.z), i.r * s, 0, 6.3); c.fill(); });
  c.fillStyle = "#ffd24a"; c.beginPath(); c.arc(75, 75, 4.5, 0, 6.3); c.fill();
  const ev = world.event;
  if (ev) {   // the event: a gold mark that pulses over its island
    const u = (performance.now() / 900) % 1, x = mx(ev.x), y = mz(ev.z);
    c.strokeStyle = `rgba(255,210,74,${1 - u})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5 + u * 12, 0, 6.3); c.stroke();
    c.fillStyle = "#ffd24a"; c.strokeStyle = "#10202e"; c.lineWidth = 1.5; c.beginPath();
    if (ev.type === "prize") { c.moveTo(x, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y); c.closePath(); } else c.arc(x, y, 4.5, 0, 6.3);
    c.fill(); c.stroke();
  }
  for (const m of world.monsters) { const x = mx(m.x), y = mz(m.z); c.fillStyle = m.target === me ? "#ff7a70" : "#c79bff"; c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 3.2, y + 2.8); c.lineTo(x - 3.2, y + 2.8); c.closePath(); c.fill(); }
  for (const r of world.riders) {
    if (r === me) continue; const x = mx(r.x), y = mz(r.z), rad = 2 + Math.min(3, r.stake / 60);
    c.fillStyle = r.goal?.rider === me ? "#ff7a70" : r.human ? "#ffd24a" : "#fff"; c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.fill();
    if (r.crowned) { c.strokeStyle = "#ffd24a"; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rad + 2.5, 0, 6.3); c.stroke(); }
  }
  c.save(); c.translate(mx(me.x), mz(me.z)); c.rotate(-me.yaw); c.fillStyle = "#6fd0ff"; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.fill(); c.restore();
  if (me.crowned) { c.strokeStyle = "#ffd24a"; c.lineWidth = 1.5; c.beginPath(); c.arc(mx(me.x), mz(me.z), 9, 0, 6.3); c.stroke(); }
}
// What the world did this frame (alone, or on the host). Guests hear the same things from the host, see guestMsg.
function handle(events) {
  for (const e of events) {
    if (e.type === "challenge") openFight(e.a, e.b);
    if (role === "host") {   // what the guests cannot work out from the snapshots
      if (e.type === "join") NET.cast({ type: "add", r: [row(e.rider)] });
      if (e.type === "ring" && e.rider.remote) NET.send(e.rider.remote, { type: "ring", value: e.value, i: world.rings.indexOf(e.ring) });
      if (e.type === "ring" && e.ring.ev === "prize") NET.cast({ type: "prize", id: e.rider.id }, e.rider.remote);
      if (e.type === "warn" && e.prey?.remote) NET.send(e.prey.remote, { type: "warn", id: e.rider.id });
      if (e.type === "dared") NET.cast({ type: "dared", id: e.rider.id, kind: e.monster.kind, k: e.k, dir: e.dir, amount: e.amount, burn: e.burn, gain: e.gain, hoard0: e.hoard0, carry0: e.carry0 });
      if (e.type === "settled") {
        const ref = [...refs.values()].find(f => f.riders.includes(e.winner) && f.riders.includes(e.loser));
        if (ref) { ref.closed = true; endFight(ref, e, "left"); }   // only a fight cut short by someone leaving is still open here
        NET.cast({ type: "took", w: e.winner.id, l: e.loser.id, draw: e.draw, amount: e.amount });
      }
    }
    if (e.type === "crown" && performance.now() > crownAt) { crownAt = performance.now() + 6000; crownSay(e.rider); }
    if (!me) continue;
    if (e.type === "ring" && e.rider === me) ringMine(e.ring, e.value);
    if (e.type === "ring" && e.rider !== me && e.ring.ev === "prize") toast(t("prizeTook", { who: nameOf(e.rider) }));
    if (e.type === "join" && world.t > 3) toast(t("join", { who: nameOf(e.rider), n: fmt(e.rider.stake) }));
    if (e.type === "warn" && (e.prey || me) === me) { toast(t("hunted", { who: nameOf(e.rider) }), "warn"); band.horn(); }
    if (e.type === "settled" && !e.draw && e.winner !== me && e.loser !== me) { view.coins(e.loser, e.winner, e.amount); if (e.amount >= 8) toast(t("took", { w: nameOf(e.winner), l: nameOf(e.loser), n: fmt(e.amount) })); }
    if (e.type === "event") announce(e.event);
    if (e.type === "dare" && e.rider === me) band.horn();
    if (e.type === "dared") dared(e.rider, { kind: e.monster.kind, k: e.k, dir: e.dir, amount: e.amount, burn: e.burn, gain: e.gain, hoard0: e.hoard0, carry0: e.carry0 });
  }
}
// A dare was settled. Mine: the wheel. Someone else's: a line once their wheel would have stopped.
function dared(rider, e) {
  if (!me || !rider) return;
  if (rider === me) { startWheel(e); return; }
  if (!e.dir || (!rider.human && e.amount < 15)) return;
  const mine = me; setTimeout(() => { if (me === mine) toast(t(e.dir > 0 ? "dareToastWon" : "dareToastLost", { r: nameOf(rider), n: fmt(e.dir > 0 ? e.gain : e.amount), who: t("m_" + e.kind) })); }, SPIN_SECS * 1000);
}

// ---------- pause and the fight record ----------
// away: the page went to the background. Alone that pauses even a fight (time stops with the music), and the round starts over on return.
function setPause(on, away = false) {
  if (!me || (online() ? menu : paused) === on) return;
  if (on && (dueling() || wheel) && !(away && !online())) { toast(t(online() ? "noMenu" : "noPause"), "warn", true); return; }
  keys.clear(); stickEnd();
  if (online()) menu = on;                                         // a shared sky never stops: this only opens the menu
  else { paused = on; if (on) band.ctx?.suspend(); else { band.ctx?.resume(); if (dueling() && !D.cur.over) restartRound(); } }
  $("pause").hidden = !on; pauseLabels(); if (on) $("resumeBtn").focus();
}
function pauseLabels() {
  const open = paused || menu, sky = online();
  $("pauseBtn").textContent = open ? t(sky ? "close" : "resume") : t(sky ? "menu" : "pause");
  $("pauseHead").textContent = t(sky ? "menuHead" : "pausedHead"); $("pauseSub").textContent = t(sky ? "menuSub" : "pausedSub"); $("resumeBtn").textContent = t(sky ? "close" : "resume");
  $("pauseSky").hidden = !sky; if (sky) $("pauseSky").textContent = NET.code;   // the code, so more people can be let in while flying
  if (open) $("pauseQuests").innerHTML = questsHtml();
  if (open && me) { const keep = Math.min(me.start, me.stake); $("quitBtn").textContent = world.canLand(me) ? t("quitBank", { n: fmt(me.stake) }) : t("quitAway", { k: fmt(keep), b: fmt(me.stake - keep) }); }   // what leaving now would really do
}
onTap($("pauseBtn"), () => setPause(!(paused || menu)));
$("resumeBtn").addEventListener("click", () => setPause(false));
$("quitBtn").addEventListener("click", () => { if (me && !dueling() && !wheel) land("quit"); });
addEventListener("visibilitychange", () => { if (document.hidden && me && !online() && !AUTO) setPause(true, true); });
function renderLog() {
  const r = me ? { ...run, home: me.stake, seed: world.seedHex, sky: online() } : lastRun; if (!r) return;
  const tl = (times, cls, flags) => `<div class="tl">${times.map((c, k) => `<i class="${flags && !flags[k] ? "miss" : flags && flags[k] === 2 ? "late" : cls}" style="left:${(c / CALL * 100).toFixed(1)}%"></i>`).join("")}</div>`;
  let n = 0;
  const rows = r.fights.map(f => {
    const res = f.result === "won" ? t("logWon", { g: fmt(f.gain), a: fmt(f.amount), b: fmt(f.burn) }) : f.result === "lost" ? t("logLost", { a: fmt(f.amount) }) : t("logDraw");
    if (f.dare) return `<li class="${f.result}"><div class="lgHead"><b>${t("logDare", { who: t("m_" + f.kind), h: fmt(f.hoard0), c: fmt(f.carry0) })}</b><em>${res}</em></div><div class="lgTrack"><span>${t("logDareOut", { p: Math.round(DARE[f.k].p * 100), o: t("d" + f.k) })}</span></div></li>`;
    const who = p => p === f.mine ? t("you") : f.who, note = [f.forfeit && t("logForfeit"), f.insured ? t("logInsured") : f.crown && f.result !== "draw" && t("logCrown")].filter(Boolean).join(" · ");
    const rounds = f.rounds.map((c, k) => { const j = judge(c); return `<div class="lgTrack"><span>${t("logRound", { r: k + 1, who: who(c.caller), n: j.n })}</span>${tl(c.call, "call")}</div><div class="lgTrack"><span>${t("logEcho", { who: who(1 - c.caller), m: j.missed, l: j.late, x: c.extra, k: j.hits, h: j.hits === 1 ? "hit" : "hits" })}</span>${tl(c.call, "echo", c.resp)}</div>`; }).join("");
    return `<li class="${f.result}"><div class="lgHead"><b>${t("logRow", { i: ++n, who: f.who })} · ${f.hits[f.mine]} : ${f.hits[1 - f.mine]}${note ? ` · ${note}` : ""}</b><em>${res}</em></div>${rounds}</li>`;
  }).join("");
  const won = r.fights.reduce((a, f) => a + (f.result === "won" ? f.gain : 0), 0), lost = r.fights.reduce((a, f) => a + (f.result === "lost" ? f.amount : 0), 0), x = r.start + r.rings + won - lost, same = x === r.home;
  $("logBody").innerHTML = `<p>${t("logIntro")} ${t("logIntro2")}</p>${rows ? `<ol class="lg">${rows}</ol>` : `<p class="tiny">${t("logEmpty")}</p>`}
    <p class="lgCheck ${same ? "ok" : "bad"}">${t(same ? "logOk" : "logBad", { s: fmt(r.start), r: fmt(r.rings), w: fmt(won), l: fmt(lost), x: fmt(x), y: fmt(r.home) })}</p><p class="tiny">${t("logChance", { seed: r.seed.slice(0, 16) })}${r.sky ? " " + t("logSky") : ""}</p>`;
}
const openDlg = id => { $(id).showModal(); $(id).querySelector(".gFoot button").focus(); };
for (const id of ["logBtn", "logBtn2", "logBtn3"]) $(id).addEventListener("click", () => { if (me && !paused && !dueling() && !wheel && !online()) setPause(true); renderLog(); openDlg("log"); });
$("logClose").addEventListener("click", () => $("log").close());
for (const id of ["guideBtn", "guideBtn2"]) $(id).addEventListener("click", () => { $("guideOdds").innerHTML = oddsRows(); openDlg("guide"); });
$("guideClose").addEventListener("click", () => $("guide").close());
$("againBtn").addEventListener("click", () => takeOff());
$("homeBtn").addEventListener("click", () => { $("result").hidden = true; $("club").hidden = false; renderSetup(); $("goBtn").focus(); });
// The result as a post on X: what was taken, fights won, who is playing. In the language on screen.
function bragText(r) {
  const net = r.home - r.start, head = r.why === "out" ? t("bOut") : net > 0 ? t("bTook", { n: fmt(net) }) : net < 0 ? t("bLeft", { n: fmt(-net) }) : r.home > 0 ? t("bEven") : t("bFree");
  return `${head}${r.won ? " " + t(r.won === 1 ? "bWin1" : "bWins", { w: r.won }) : ""}\n${xTail()}`;
}
function renderShare() {
  if (!lastRun) return;
  $("shareBtn").href = intentUrl(bragText(lastRun), siteUrl());
  const h = myHandle(); $("resWho").hidden = !h; $("resX").textContent = h ? "@" + h : ""; $("resX").classList.toggle("xok", !!xUser);
  $("resAva").hidden = !xUser?.pic; if (xUser?.pic && $("resAva").getAttribute("src") !== xUser.pic) $("resAva").src = xUser.pic;
}
$("copyBtn").addEventListener("click", async () => {
  const r = lastRun, text = `${t("copyText", { k: t(myKind), s: fmt(r.start), n: fmt(r.home), w: r.won, l: r.lost, d: r.draws, x: r.fights.length - fights(r).length, f: `${myFriend.family} #${myFriend.id}` })}\n${siteUrl()}`;
  try { await navigator.clipboard.writeText(text); $("copyBtn").textContent = t("copied"); } catch { $("copyBtn").textContent = t("copyFail"); }
  setTimeout(applyLang, 1600);
});

// ---------- test bot: flies to the nearest rider worth fighting, then home to the Roost ----------
function botInput() {
  const want = Number(params.get("fights")) || 2, home = fights(run).length >= want && !(params.has("ring1") && run.ringN < 1);
  if (world.dareFor(me)) { if (params.has("dare")) act(); else waveOff(); }   // test hook: &dare makes the bot take every dare
  // test hook: who the bot goes for first. "human" any other player, "cpu" computer riders, "crown" the crowned rider, or one player's name. A test can change it in flight.
  const hunt = window.__hunt ?? params.get("hunt"), prefer = r => !hunt || (hunt === "human" ? r.human : hunt === "cpu" ? !r.human : hunt === "crown" ? r.crowned : r.name === hunt) ? 0 : 5000;
  const far = r => Math.hypot(r.x - me.x, r.z - me.z);
  let o = home ? null : world.riders.filter(r => r !== me && r.state === "fly" && r.stake >= 4 && !world.safe(r)).sort((a, b) => prefer(a) + far(a) - prefer(b) - far(b))[0];
  // carrying nothing, or asked to (&rings): go for the nearest ring instead; an event's rings first
  if (!home && (me.stake < 1 || params.has("rings") || (params.has("ring1") && run.ringN < 1) || (world.event && params.has("events")))) o = world.rings.filter(g => g.back <= world.t).sort((a, b) => far(a) * (a.ev ? 0.2 : 1) + Math.abs(a.y - me.y) - far(b) * (b.ev ? 0.2 : 1) - Math.abs(b.y - me.y))[0] || o;
  const g = o || { x: 0, y: 60, z: 0 };
  const n = home ? null : world.near(me);
  if (home ? world.canLand(me) : n && !params.has("rings") && prefer(n) === 0) act();   // it only picks the fights it was sent for; hunters may still pick it
  if (!me) return IDLE;
  const d = Math.atan2(g.x - me.x, g.z - me.z) - me.yaw, turn = clamp(Math.atan2(Math.sin(d), Math.cos(d)) * 2, -1, 1), dy = g.y - me.y, flat = Math.hypot(g.x - me.x, g.z - me.z);
  const ahead = Math.max(world.heightAt(me.x + Math.sin(me.yaw) * 30, me.z + Math.cos(me.yaw) * 30), 0) + 10;
  return { turn, climb: me.y < ahead || dy > 5 ? 1 : dy < -8 ? -1 : 0, throttle: flat < 40 && Math.abs(dy) > 6 ? 0 : 1 };
}

// ---------- the shared sky ----------
// Messages. Guest to host: hi, name, up (take off, with stake and shop items), p (my pose), ring (I flew through one),
// fight (I challenge), dare (I take or wave off a monster's dare), land, call / echo (my taps in a fight with another
// player), result (my finished fight with a computer rider).
// Host to guest: room, people, add (new riders), s (snapshot: every rider's pose, stake and marks, the monsters, the
// pool, the event, which rings are up), go (your dragon is in the sky), ring, prize, warn, duel, call / echo (the other
// player's taps), resolve (a round, as the host counted it), over (the settlement), took (someone else's fight),
// dared (a wheel's outcome), landed, closed.
const packFriend = f => f.custom ? { id: f.id, gen: f.gen, family: f.family, frames: f.frames, custom: true } : f.id;
function friendOf(v) {   // a Friend named by another device: one we know by its number, or its pixels if it is new to us
  try {
    if (v && typeof v === "object") {
      const id = Number(v.id); if (friends.has(id)) return friends.get(id);
      if (Number.isInteger(id) && id > 0 && Array.isArray(v.frames) && v.frames.length === 64 && v.frames.every(x => /^[0-9a-f]{1,64}$/i.test(x)))
        return addFriend({ id, gen: Number(v.gen) || 1, family: cleanName(v.family, 12) || "Friend", frames: v.frames, custom: true });
    } else if (friends.has(v)) return friends.get(v);
  } catch { /* fall through */ }
  return pool[0];
}
const rankIn = v => Number.isInteger(v) && v >= 0 && v < RANK_AT.length ? v : null;
const row = r => ({ id: r.id, f: packFriend(r.f), kind: r.kind, human: r.human, name: r.human ? r.name : null, rank: r.human ? r.rank ?? null : null, skill: r.skill, stake: r.stake, x: r.x, y: r.y, z: r.z, yaw: r.yaw, xh: r.human ? r.xh || "" : "", xok: !!(r.human && r.xok) });
// What a player says about X with its name: the handle it typed or signed in with, and the signed badge if it signed in.
const xOut = () => ({ xh: myHandle(), xb: xUser?.badge || "" });
const rd = (v, k = 10) => Math.round(v * k) / k;
const MSTATE = ["roam", "taunt", "dare", "spin", "flee"], EVS = ["storm", "prize"];
const songFor = pid => songT() + NET.rtt(pid) / 2000;             // my song time as it will be when the message lands there
// Put my song on the host's beat, so a fight between two players starts on the same beat on both devices.
function syncSong(song, force = false) {
  if (typeof song !== "number" || !band.ctx) return;
  const want = band.now - offsetMs / 1000 - heardLag() - song;
  if (!force && Math.abs(want - t0) < 0.025) return;
  t0 = want; if (me) band.play(t0);
}
// A rider flown somewhere else moves toward its last known pose, carried forward by its own speed.
function glide(r, dt) {
  const n = r.net; if (!n) return;
  const age = Math.min(0.25, (performance.now() - n.at) / 1000), hs = Math.cos(n.pitch) * n.speed * age, k = Math.min(1, dt * 12);
  r.x += (n.x + Math.sin(n.yaw) * hs - r.x) * k; r.z += (n.z + Math.cos(n.yaw) * hs - r.z) * k; r.y += (n.y + Math.sin(n.pitch) * n.speed * age - r.y) * k;
  r.yaw = wrapA(r.yaw + wrapA(n.yaw - r.yaw) * k); r.pitch += (n.pitch - r.pitch) * k; r.roll += (n.roll - r.roll) * k;
  r.speed = n.speed; r.flap += dt * n.fr; r.gliding = n.glide;
}
// What the view's scenery knows and the rules or the map can use: tall landmarks to fly around, and island colours.
// scenery-sites.js belongs to the view, so it is asked for politely: whatever is missing is simply not used.
function sceneryExtras() {
  const w = world; nBase = w.rings.findIndex(g => g.ev); if (nBase < 0) nBase = w.rings.length;
  import("./scenery-sites.js").then(m => {
    if (world !== w) return;
    if (typeof m.landmarkColliders === "function") { const c = m.landmarkColliders(w); if (Array.isArray(c)) w.colliders = c.filter(o => [o.x, o.z, o.r, o.top].every(Number.isFinite)); }
    if (typeof m.islandColors === "function") { const c = m.islandColors(w); if (Array.isArray(c)) isleCols = c; }
  }).catch(() => { /* no extras */ });
}

// ----- host -----
function sendPeople() {
  if (role !== "host") return;
  people = [{ pid: NET.id, name: myName(), xh: myHandle(), xok: !!xUser, host: true, stake: me ? me.stake : null }, ...[...crowd].map(([pid, p]) => ({ pid, name: p.name, xh: p.xh || "", xok: !!p.xok, stake: p.rider ? p.rider.stake : null }))];
  NET.cast({ type: "people", list: people });
  if (!$("club").hidden) renderSky();
}
function snapshot(now) {
  const gap = Math.max(0.02, (now - snapAt) / 1000); snapAt = now;
  const r = world.riders.map(x => {
    const fr = clamp((x.flap - (x.flap0 ?? x.flap)) / gap, 0, 12); x.flap0 = x.flap;   // how fast the wings beat, so a mirror can keep them beating
    const marks = (x.state === "duel" ? 1 : 0) | (x.gliding ? 2 : 0) | (x.insured ? 4 : 0) | (x.state === "spin" ? 8 : 0) | (x.crowned ? 16 : 0) | (x.away ? 32 : 0);
    return [x.id, rd(x.x), rd(x.y), rd(x.z), rd(x.yaw, 1000), rd(x.pitch, 1000), rd(x.roll, 1000), rd(x.speed), x.stake, rd(x.shield), marks, x.goal?.rider?.id || 0, rd(fr), x.streak];
  });
  const g = [], up = []; world.rings.forEach((x, i) => { if (x.ev) { if (x.back <= world.t) up.push(i); } else if (x.back > world.t) g.push(i); });
  const ev = world.event, m = world.monsters.map(x => [x.id, MONSTERS.indexOf(x.kind), rd(x.x), rd(x.y), rd(x.z), rd(x.yaw, 100), x.hoard, MSTATE.indexOf(x.state), x.target?.id || 0, rd(Math.max(0, x.dareUntil - world.t)), x.line]);
  return { type: "s", t: rd(world.t, 1000), r, g, e: up, m, pl: world.pool, ev: ev ? [EVS.indexOf(ev.type), ev.isl, rd(ev.until - world.t)] : null };
}
function hostTick(now) {
  if (now - snapAt >= 80 && crowd.size) NET.cast(snapshot(now));
  if (now > peopleAt) { peopleAt = now + 2000; sendPeople(); }
  // A player whose device has gone quiet (a tab in the background sends no pose): after a few seconds its dragon is
  // shielded so it is nobody's free target, and if it stays quiet it is landed with what it carries.
  for (const [pid, p] of crowd) {
    const r = p.rider; if (!r || r.state !== "fly") { p.poseAt = now; continue; }
    const quiet = now - (p.poseAt || now);
    r.away = quiet > 4000; if (r.away) r.shield = Math.max(r.shield, 1.5);
    if (quiet > 40000) { p.rider = null; NET.send(pid, { type: "landed", stake: world.leave(r, true), why: "away" }); if (me) toast(t("leftSky", { who: p.name })); sendPeople(); }
  }
  // the fights this device referees
  for (const ref of [...refs.values()]) {
    if (ref.closed) continue;
    if (!ref.pvp) { if (now > ref.until) { ref.closed = true; endFight(ref, world.settle(ref.riders[0], ref.riders[1], true)); } continue; }   // the device playing it went quiet
    const c = ref.cur, b = songT() / SPB - (ref.b0 + ref.round * (ROUND + LEAD));
    if (!c.over && b >= ROUND + 0.7) {   // later than a fight played here, so the last taps have time to arrive
      c.over = true; ref.hits[c.caller] += judge(c).hits; ref.rounds.push({ caller: c.caller, call: [...c.call], resp: [...c.resp], extra: c.extra });
      tell(ref, { type: "resolve", fid: ref.fid, round: ref.round, call: c.call, resp: c.resp, extra: c.extra });
    } else if (c.over && b >= ROUND + 1.6) {
      if (ref.round === 0) { ref.round = 1; ref.cur = { caller: 1, call: [], resp: [], extra: 0, over: false }; }
      else { ref.closed = true; const w = ref.hits[0] > ref.hits[1] ? 0 : ref.hits[1] > ref.hits[0] ? 1 : -1; endFight(ref, w < 0 ? world.settle(ref.riders[0], ref.riders[1], true) : world.settle(ref.riders[w], ref.riders[1 - w])); }
    }
  }
}
// To both riders of a refereed fight: the one flown here hears it directly, a remote one over the network.
function tell(ref, m, except = null) {
  for (const r of ref.riders) { if (r === except) continue; if (r === me) fightMsg(m); else if (r.remote) NET.send(r.remote, m); }
}
function openFight(a, b) {
  if (!a.remote && !b.remote) { startDuel(a, b); return; }         // mine against a computer rider: all of it happens here, as when flying alone
  const pvp = a.human && b.human, fid = nextFid++, b0 = Math.ceil(songT() / SPB) + LEAD + 2;
  const ref = { fid, pvp, riders: [a, b], b0, round: 0, cur: { caller: 0, call: [], resp: [], extra: 0, over: false }, rounds: [], hits: [0, 0], until: performance.now() + 40000, t0: performance.now(), closed: false };
  refs.set(fid, ref);
  for (const r of ref.riders) {
    if (r === me) startDuel(a, b, { fid, pvp, b0 });
    else if (r.remote) { r.net = null; NET.send(r.remote, { type: "duel", fid, pvp, a: a.id, b: b.id, b0, ring: { x: a.ring.x, y: a.ring.y, z: a.ring.z }, song: songFor(r.remote) }); }
  }
}
// A tap in a fight between two players, from the rider who made it. The host keeps the count and passes it to the other one.
function refTap(ref, from, m) {
  const c = ref.cur, p = ref.riders.indexOf(from); if (p < 0 || c.over || ref.closed) return;
  const b = songT() / SPB - (ref.b0 + ref.round * (ROUND + LEAD));   // where the round is on the host's clock: a tap counts only in its own window (with a little room for the network)
  let out;
  if (m.type === "call") {
    const x = clamp(Number(m.b), 0, CALL - 0.05);
    if (p !== c.caller || b < -0.6 || b > CALL + 0.7 || !Number.isFinite(x) || c.call.length >= MAX_TAPS || c.call.some(y => Math.abs(y - x) < MIN_GAP)) return;
    c.call.push(x); c.call.sort((a, z) => a - z); c.resp = c.call.map(() => 0); out = { type: "call", fid: ref.fid, b: x };   // no echo can have been made yet: echoes are only taken after the call window
  } else {
    const rel = Number(m.rel); if (p !== 1 - c.caller || b < ECHO0 - 0.6 || b > ROUND + 0.7 || !Number.isFinite(rel)) return;
    const { i, late } = matchEcho(c.call, c.resp, rel, TOL.club);   // the host matches the tap to the call itself, from when it was played
    if (i >= 0) c.resp[i] = late ? 2 : 1; else c.extra = Math.min(12, c.extra + 1);
    out = { type: "echo", fid: ref.fid, i, late, rel: clamp(rel, -0.25, CALL) };
  }
  tell(ref, out, from);
}
function endFight(ref, out, why = "") {
  refs.delete(ref.fid);
  tell(ref, { type: "over", fid: ref.fid, w: out.draw ? 0 : out.winner.id, draw: !!out.draw, amount: out.amount, burn: out.burn, gain: out.gain, share: out.share, crown: !!out.crown, insured: !!out.insured, hits: ref.hits, rounds: ref.rounds, why });
}
function cleanRounds(v) {   // a fight result reported by a guest, checked before the host recounts it
  if (!Array.isArray(v) || v.length !== 2) return null;
  const out = [];
  for (let k = 0; k < 2; k++) {
    const c = v[k];
    if (!c || c.caller !== k || !Array.isArray(c.call) || !Array.isArray(c.resp) || c.call.length > MAX_TAPS || c.resp.length !== c.call.length || !c.call.every(x => Number.isFinite(x) && x >= 0 && x <= CALL) || !Number.isInteger(c.extra) || c.extra < 0 || c.extra > 12) return null;
    out.push({ caller: k, call: [...c.call], resp: c.resp.map(x => x === 2 ? 2 : x ? 1 : 0), extra: c.extra });
  }
  return out;
}
function hostMsg(pid, m) {
  const p = crowd.get(pid); if (!p || !m) return;
  const r = p.rider;
  switch (m.type) {
    case "hi":
      p.name = cleanName(m.name) || p.name; xIn(pid, p, m);
      NET.send(pid, { type: "room", seed: world.seedHex, t: world.t, r: world.riders.map(row), pool: world.pool, song: songFor(pid) }); sendPeople(); break;
    case "name": p.name = cleanName(m.name) || p.name; if (r) r.name = p.name; xIn(pid, p, m); sendPeople(); break;
    case "up": {
      if (r) break;
      const f = friendOf(m.f), st = STAKES.includes(m.stake) ? m.stake : 0;   // the stake is one of those on offer, whatever the message says
      p.name = cleanName(m.name) || `${f.family} #${f.id}`;
      clearFriend(f);
      xIn(pid, p, m);
      const x = p.rider = world.addRider(f, st, true, KINDS.includes(m.kind) ? m.kind : "ember", m.items); x.remote = pid; x.name = p.name; x.rank = rankIn(m.rank); x.xh = p.xh; x.xok = p.xok; p.poseAt = performance.now();   // addRider keeps only the three items the shop sells
      NET.cast({ type: "add", r: [row(x)] });
      NET.send(pid, { type: "go", id: x.id, stake: st, items: x.items, shield: x.shield, song: songFor(pid) });
      if (me) toast(t("join", { who: x.name, n: fmt(st) })); sendPeople(); break;
    }
    case "p": {   // where that player's dragon is now. Kept inside the world; what it carries is never taken from a guest.
      const a = m.a; if (!r || !Array.isArray(a) || a.length < 9 || !a.every(Number.isFinite)) break;
      p.poseAt = performance.now();
      if (r.state !== "fly") { r.net = null; r.pose = null; break; }   // in a fight, or held at a monster's wheel, the host moves the rider
      let [x, y, z] = a; const d = Math.hypot(x, z), lim = R * 1.25; if (d > lim) { x *= lim / d; z *= lim / d; }
      y = clamp(y, Math.max(world.heightAt(x, z), 0) + 2.4, CEIL);
      const at = performance.now(), was = r.pose;   // further than a dragon can fly since its last pose: not believed, the rider stays where it was
      if (was && Math.hypot(x - was.x, y - was.y, z - was.z) > 100 * Math.min(2.5, (at - was.at) / 1000) + 30) break;
      r.pose = { x, y, z, at };
      r.net = { x, y, z, yaw: wrapA(a[3]), pitch: clamp(a[4], -1, 1), roll: clamp(a[5], -1.2, 1.2), speed: clamp(a[6], 0, 95), fr: clamp(a[7], 0, 12), glide: !!a[8], at: performance.now() };
      r.edge = d > R; break;
    }
    case "ring": if (r && Number.isInteger(m.i)) world.claimRing(r, m.i); break;
    case "fight": { const o = world.riders.find(x => x.id === m.id); if (r && o && o !== r && Math.hypot(o.x - r.x, o.y - r.y, o.z - r.z) < FIGHT_RANGE * 2.5) world.challenge(r, o); break; }
    case "dare": if (r) { if (m.yes) world.acceptDare(r); else world.declineDare(r); } break;
    case "land":
      if (!r || r.state !== "fly") break;                          // a fight that started first has to be finished
      p.rider = null; NET.send(pid, { type: "landed", stake: world.leave(r, Math.hypot(r.x, r.z) > 56) }); if (me) toast(t("leftSky", { who: p.name })); sendPeople(); break;   // away from the Roost (with room for lag) only what was brought is kept
    case "call": case "echo": { const ref = refs.get(m.fid); if (ref?.pvp && r) refTap(ref, r, m); break; }
    case "result": {   // a guest's fight with a computer rider: recount the hits with the same rule, then move the coins here
      const ref = refs.get(m.fid); if (!ref || ref.pvp || ref.closed || !r || !ref.riders.includes(r)) break;
      if (performance.now() - ref.t0 < 15000) break;               // no fight can be over that soon: not believed (it ends as a draw when its time runs out)
      const rounds = cleanRounds(m.rounds), [a, b] = ref.riders; ref.closed = true;
      if (rounds) { ref.rounds = rounds; ref.hits = rounds.map(c => judge(c).hits); }
      const w = ref.hits[0] > ref.hits[1] ? 0 : ref.hits[1] > ref.hits[0] ? 1 : -1;
      endFight(ref, w < 0 ? world.settle(a, b, true) : world.settle(ref.riders[w], ref.riders[1 - w])); break;
    }
  }
}
// A guest's X handle is cleaned like a name. Its X mark is only believed once this site's server has checked the signed
// badge that came with it, and only for the handle the badge was signed for; a typed handle is shown as typed, unmarked.
function xIn(pid, p, m) {
  const h = cleanHandle(m.xh), was = `${p.xh}|${p.xok}`;
  if (h !== p.xh) { p.xh = h; p.xok = false; }
  const badge = typeof m.xb === "string" ? m.xb : "";
  if (h && badge && xOn && badge !== p.xb) { p.xb = badge; xVerify(badge).then(u => { if (crowd.get(pid) !== p || p.xh !== h || u.toLowerCase() !== h.toLowerCase()) return; p.xok = true; xWho(p); }); }
  if (`${p.xh}|${p.xok}` !== was) xWho(p);
}
function xWho(p) { if (p.rider) { p.rider.xh = p.xh; p.rider.xok = p.xok; NET?.cast({ type: "who", id: p.rider.id, xh: p.xh, xok: p.xok }); } sendPeople(); }
function hostLeave(pid) {
  const p = crowd.get(pid); if (!p) return; crowd.delete(pid);
  if (p.rider) { world.leave(p.rider, true); if (me) toast(t("leftSky", { who: p.name })); }   // in the middle of a fight this is a forfeit: see World.leave
  sendPeople();
}

// ----- guest -----
// The host's sky is rebuilt here from its seed (same islands, rings and thermals) and then mirrored: no computer
// riders or monsters are moved by this device, and the only dragon that flies by itself is mine.
function buildSky(seed) {
  world = new World(seed, all); world.wantRivals = 0; world.wantMonsters = 0; byId.clear();
  const old = $("world"), cv = old.cloneNode(false); old.replaceWith(cv);
  try { view.dispose(); } catch { /* the old picture is dropped either way */ }
  view = new View(cv, world, sprite); bindCanvas(cv); tags.clear(); $("tags").innerHTML = ""; sceneryExtras();
}
function addRows(rows, quiet = false) {
  for (const d of Array.isArray(rows) ? rows : []) {
    if (byId.has(d.id)) continue;
    const r = { id: d.id, f: friendOf(d.f), human: !!d.human, name: d.human ? cleanName(d.name) || null : null, rank: d.human ? rankIn(d.rank) : null, xh: d.human ? cleanHandle(d.xh) : "", xok: !!(d.human && d.xok && cleanHandle(d.xh)), kind: KINDS.includes(d.kind) ? d.kind : "ember", skill: Number(d.skill) || 0.5, stake: Number(d.stake) || 0,
      x: Number(d.x) || 0, y: Number(d.y) || 60, z: Number(d.z) || 0, yaw: Number(d.yaw) || 0, pitch: 0, roll: 0, speed: 30, flap: 0, gliding: false, state: "fly", shield: 0, edge: false, lift: false, goal: null, net: null,
      streak: 0, crowned: false, insured: false, magnet: false, away: false, items: [] };
    byId.set(r.id, r); world.riders.push(r);
    if (!quiet && me) toast(t("join", { who: nameOf(r), n: fmt(r.stake) }));
  }
}
function mirror(m) {
  const now = performance.now(), seen = new Set(); let crown = null;
  world.t = Math.abs(m.t - world.t) > 0.5 ? m.t : world.t + (m.t - world.t) * 0.15; world.pool = Number(m.pl) || 0;
  for (const a of m.r) {
    const r = byId.get(a[0]); if (!r) continue;
    const k = a[10];
    seen.add(r.id); r.stake = a[8]; r.shield = a[9]; r.state = k & 1 ? "duel" : k & 8 ? "spin" : "fly"; r.hunt = a[11]; r.streak = a[13] || 0; r.insured = !!(k & 4); r.crowned = !!(k & 16); r.away = !!(k & 32);
    if (r.crowned) crown = r;
    if (r === me && r.state === "fly") { r.net = null; continue; }  // my own dragon is flown here; the host only moves it during a fight or a dare
    r.net = { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], roll: a[6], speed: a[7], fr: a[12], glide: !!(k & 2), at: now };
  }
  if (crown !== world.crown) { world.crown = crown; if (crown && now > crownAt) { crownAt = now + 6000; crownSay(crown); } }
  if (me && !seen.has(me.id)) { landed(landing?.why || "quit", landing?.by || null, me.stake); }   // the host no longer has my dragon
  for (const r of world.riders) if (!seen.has(r.id)) { byId.delete(r.id); if (r.human && me) toast(t("leftSky", { who: nameOf(r) })); }
  world.riders = world.riders.filter(r => seen.has(r.id));
  for (const r of world.riders) r.goal = r.hunt ? { rider: byId.get(r.hunt) } : null;   // who hunts whom, for the name tags and the map
  const down = new Set(m.g), up = new Set(m.e);
  world.rings.forEach((g, i) => { g.back = g.hold > now ? Infinity : g.ev ? (up.has(i) ? Math.min(g.back, world.t) : Infinity) : down.has(i) ? Infinity : 0; });
  // the event that is on
  const e = m.ev, was = world.event;
  if (e) {
    const type = EVS[e[0]], s = world.islands[e[1]];
    if (s && (!was || was.type !== type || was.isl !== e[1])) { world.event = { type, isl: e[1], x: s.x, z: s.z, until: 0, rings: [] }; announce(world.event); }
    if (world.event) { world.event.until = world.t + e[2]; world.event.rings = [...up]; }
  } else world.event = null;
  // the monsters
  const live = new Set();
  for (const a of m.m || []) {
    let o = world.monsters.find(x => x.id === a[0]); if (!o) { o = { id: a[0], kind: MONSTERS[a[1]] || "imp", x: a[2], y: a[3], z: a[4], yaw: a[5], state: "roam" }; world.monsters.push(o); }
    const st = MSTATE[a[7]] || "roam", tg = byId.get(a[8]) || null;
    if (st === "dare" && o.state !== "dare" && tg === me && me) band.horn();
    live.add(o.id); o.net = { x: a[2], y: a[3], z: a[4], yaw: a[5] }; o.hoard = a[6]; o.state = st; o.target = tg; o.dareUntil = world.t + a[9]; o.line = a[10];
  }
  world.monsters = world.monsters.filter(o => live.has(o.id));
}
function guestStep(dt, input, now) {
  world.t += dt;
  for (const o of world.monsters) { const n = o.net, k = Math.min(1, dt * 8); if (n) { o.x += (n.x - o.x) * k; o.y += (n.y - o.y) * k; o.z += (n.z - o.z) * k; o.yaw = wrapA(o.yaw + wrapA(n.yaw - o.yaw) * k); } }
  for (const r of world.riders) {
    if (r !== me || me.state !== "fly") { glide(r, dt); continue; }
    if (landing) continue;
    world.fly(me, input, dt);
    const reach = RING_R * (me.magnet ? MAGNET : 1);
    world.rings.forEach((g, i) => {   // tell the host I flew through it; the host checks and pays from the pool
      if (g.back <= world.t && Math.hypot(g.x - me.x, g.y - me.y, g.z - me.z) < reach) { g.back = Infinity; g.hold = now + 800; me.speed += 5; NET.toHost({ type: "ring", i }); }
    });
  }
  if (me && me.state === "fly" && !landing && now - poseAt >= 75) {
    poseAt = now;
    NET.toHost({ type: "p", a: [rd(me.x), rd(me.y), rd(me.z), rd(me.yaw, 1000), rd(me.pitch, 1000), rd(me.roll, 1000), rd(me.speed), input.climb > 0.3 ? 10 : input.throttle > 0 ? 7.5 : 0, me.gliding ? 1 : 0] });
  }
}
// What the host says about a fight I am in. On the host's own device the same messages arrive without the network.
function fightMsg(m) {
  if (!D || D.fid !== m.fid) return;
  if (m.type === "call") callTap(m.b, false);
  if (m.type === "echo") echoTap(m.rel, false, Number.isInteger(m.i) ? m.i : -1, !!m.late);
  if (m.type === "resolve" && !D.cur.over) {
    if (m.round === 1 && D.round === 0) { D.round = 1; newRound(); }
    Object.assign(D.cur, { call: [...m.call], resp: [...m.resp], extra: m.extra }); resolveRound();
  }
  if (m.type === "over" && !D.done) {
    if (m.why !== "left" && m.rounds?.length === 2) { D.rounds = m.rounds; D.hits = [...m.hits]; for (const p of [0, 1]) $("dS" + p).textContent = D.hits[p]; }
    showResult(m.draw ? -1 : D.riders[0].id === m.w ? 0 : 1, m, m.why);
  }
}
const tapOut = m => { if (role === "guest") NET.toHost(m); else { const ref = refs.get(m.fid); if (ref) refTap(ref, me, m); } };
function guestMsg(m) {
  if (!m) return;
  if (m.type === "full") { leaveSky(); note("skyFull"); renderSky(); return; }
  if (m.type === "closed") { leaveSky("closed"); note("skyClosed"); skyTab = "alone"; lastSky = null; renderSetup(); return; }
  if (m.type === "room") {
    role = "guest"; lastSky = NET.code; buildSky(String(m.seed)); world.t = Number(m.t) || 0; world.pool = Number(m.pool) || 0; addRows(m.r, true); syncSong(m.song, true);
    note("skyIn", { code: NET.code }); renderSetup(); resNote();
    if (AUTO && params.has("go")) takeOff();
    return;
  }
  if (role !== "guest") return;
  switch (m.type) {
    case "people": people = Array.isArray(m.list) ? m.list.slice(0, 8).map(p => ({ pid: p.pid, name: cleanName(p.name), xh: cleanHandle(p.xh), xok: !!p.xok && !!cleanHandle(p.xh), host: !!p.host, stake: p.stake == null ? null : Number(p.stake) })) : []; if (!$("club").hidden) renderSky(); break;
    case "who": { const r = byId.get(m.id); if (r && r.human) { r.xh = cleanHandle(m.xh); r.xok = !!m.xok && !!r.xh; } break; }
    case "add": addRows(m.r); break;
    case "s": mirror(m); break;
    case "go": {
      const r = byId.get(m.id); if (!r || me) break;
      me = r; me.mine = true; me.net = null; me.start = Number(m.stake) || 0; me.items = (Array.isArray(m.items) ? m.items : []).filter(k => ITEMS[k]); me.magnet = me.items.includes("magnet"); me.insured = me.items.includes("insure"); me.shield = Number(m.shield) || 5;
      const cost = charge(me.start, me.items); syncSong(m.song, true); enterSky(me.start, cost); break;
    }
    case "ring": if (me) ringMine(world.rings[m.i], m.value); break;
    case "prize": { const r = byId.get(m.id); if (me && r && r !== me) toast(t("prizeTook", { who: nameOf(r) })); break; }
    case "warn": { const r = byId.get(m.id); if (me && r) { toast(t("hunted", { who: nameOf(r) }), "warn"); band.horn(); } break; }
    case "duel": {
      const a = byId.get(m.a), b = byId.get(m.b); if (!me || !a || !b || (a !== me && b !== me)) break;
      if (m.pvp) syncSong(m.song); me.state = "duel"; startDuel(a, b, m); break;
    }
    case "call": case "echo": case "resolve": case "over": fightMsg(m); break;
    case "took": {
      const w = byId.get(m.w), l = byId.get(m.l); if (!me || !w || !l || m.draw || w === me || l === me) break;
      view.coins(l, w, m.amount); if (m.amount >= 8) toast(t("took", { w: nameOf(w), l: nameOf(l), n: fmt(m.amount) })); break;
    }
    case "dared": if (MONSTERS.includes(m.kind) && DARE[m.k]) dared(byId.get(m.id), m); break;
    case "landed": if (me) landed(m.why === "away" ? "away" : landing?.why || "quit", landing?.by || null, Number(m.stake) || 0); break;
  }
}

// ----- opening, joining and leaving a sky -----
const note = (key, v = {}) => { skyNote = key ? [key, v] : null; };
function makeNet() {
  const net = new Net({
    onMessage: (pid, m) => { if (NET !== net) return; if (net.role === "host") hostMsg(pid, m); else guestMsg(m); },
    onJoin: pid => { if (NET === net) crowd.set(pid, { name: "Rider", rider: null, poseAt: 0 }); },
    onLeave: pid => { if (NET === net) hostLeave(pid); },
    onStatus: (state, info) => {
      if (NET !== net) return;
      if (state === "error") { leaveSky(); note(info === "no-room" ? "skyNone" : "skyErr", { e: info || "network" }); if (info === "no-room") lastSky = null; renderSetup(); resNote(); }
      if (state === "closed") { const code = net.code; leaveSky("lost"); lastSky = code; note("skyLost"); renderSetup(); resNote(); }   // my own link dropped, or the host went away without a word: say so, and offer the way back in
    },
  });
  return net;
}
// The PeerJS script loads on its own; give it a moment before saying online play is not there.
async function netLoaded() { for (let i = 0; i < 40 && !netReady(); i++) await new Promise(r => setTimeout(r, 100)); return netReady(); }
async function openSky() {
  leaveSky(); skyTab = "create"; lastSky = null; note("skyOpening"); renderSky();
  band.ensure();                                                   // the tap that opens the sky also unlocks sound
  if (!await netLoaded()) { note("skyOff"); renderSky(); return; }
  const net = NET = makeNet();
  try { const code = await net.host(); if (NET !== net) return; role = "host"; t0 = band.now; note("skyOpen", { code }); sendPeople(); }
  catch { /* the status handler has put the reason on screen */ }
  renderSetup();
}
async function joinSky(code) {
  code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  leaveSky(); skyTab = "join";
  if (code.length !== 6) { note("skyNone"); renderSetup(); return; }
  note("skyJoining", { code }); renderSetup(); resNote(); band.ensure();
  if (!await netLoaded()) { note("skyOff"); renderSetup(); resNote(); return; }
  const net = NET = makeNet();
  try { await net.join(code); if (NET === net) net.toHost({ type: "hi", name: myName(), ...xOut() }); }
  catch { /* the status handler has put the reason on screen */ }
}
// Back to a sky of my own. A host closes its sky for everyone; a guest is landed with what it carries.
// why "lost": my link dropped. In the middle of a fight that is a forfeit here too, so pulling the plug is never the best move.
function leaveSky(why = "closed") {
  const was = role, net = NET;
  if (was === "host") {   // every player still up there leaves the sky; a fight with me ends as their forfeit
    for (const p of crowd.values()) if (p.rider) world.leave(p.rider);
    handle(world.drain()); crowd.clear(); refs.clear();
  }
  NET = null; role = "solo"; people = []; going = false; note(null);
  net?.close(was === "host" ? { type: "closed" } : { type: "bye" });
  if (was === "host" && me) { $("hint").innerHTML = t("hint"); pauseLabels(); }
  if (was === "guest") {
    if (me) { const had = Math.max(0, me.stake - (why === "lost" && dueling() ? world.spoilsOf(me).amount : 0)); landed(why, null, why === "lost" && !world.canLand(me) ? Math.min(me.start, had) : had); }   // a link that drops away from the Roost keeps what was brought, like leaving by the menu
    world = Object.assign(world, soloBooks()); byId.clear();       // the mirror becomes a sky of my own, with computer riders again
  }
  menu = false;
}
// A mirrored sky turned back into my own: empty of riders and monsters, every ordinary ring up, and a fresh pool.
function soloBooks() {
  for (const g of world.rings) { g.back = g.ev ? Infinity : 0; g.hold = 0; }
  return { riders: [], monsters: [], wantRivals: 9, wantMonsters: 5, monsterAt: world.t + 2, event: null, nextEvent: world.t + 40, crown: null, pool0: POOL, pool: POOL, brought: 0, burned: 0, home: 0 };
}
addEventListener("pagehide", () => { if (NET) NET.close(role === "host" ? { type: "closed" } : { type: "bye" }); });
// On the landing screen: what is happening with the sky (joining again, joined, lost).
function resNote() { const el = $("resNet"); el.hidden = $("result").hidden || !skyNote; el.textContent = skyNote ? t(...skyNote) : ""; }
function renderSky() {
  document.querySelectorAll("#skySeg button").forEach(b => b.classList.toggle("on", b.dataset.v === skyTab));
  $("skyBox").hidden = skyTab === "alone" && !skyNote;
  $("skyHost").hidden = role !== "host"; $("skyJoin").hidden = skyTab !== "join" || role === "guest";
  if (role === "host") { $("skyCodeOut").textContent = NET.code; $("skyShare").href = intentUrl(t("inviteText", { code: NET.code, p: PROJECT }), inviteLink()); }
  $("skyMsg").textContent = skyNote ? t(...skyNote) : "";
  const again = lastSky && role === "solo" && !NET;
  for (const id of ["skyRejoin", "rejoinBtn"]) { $(id).hidden = !again; if (again) $(id).textContent = t("rejoin", { code: lastSky }); }
  const mine = NET?.id;
  $("skyList").hidden = !online();
  $("skyList").innerHTML = people.map(p => `<li class="${p.pid === mine ? "me" : ""}"><b>${p.xh ? "@" + p.xh : p.name}${p.xh && p.xok ? XMARK : ""}</b>${p.pid === mine ? ` <i>${t("pYou")}</i>` : ""}${p.host ? ` <i>${t("pHost")}</i>` : ""}<span>${p.stake == null ? t("pGround") : t("pFlying", { n: fmt(p.stake) })}</span></li>`).join("");
}
$("skySeg").addEventListener("click", e => {
  const v = e.target.closest("button")?.dataset.v; if (!v || v === skyTab && (v !== "create" || role === "host")) return;
  if (v === "create") { openSky(); return; }
  leaveSky(); lastSky = null; skyTab = v; renderSetup();
  if (v === "join") $("skyCode").focus();
});
$("skyJoinBtn").addEventListener("click", () => joinSky($("skyCode").value));
$("skyCode").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); joinSky($("skyCode").value); } });
for (const id of ["skyRejoin", "rejoinBtn"]) $(id).addEventListener("click", () => { if (lastSky) joinSky(lastSky); });
const inviteLink = () => `${siteUrl()}?room=${NET?.code || ""}`;   // the real game's address when this copy is not served over https, so the link works for whoever gets it
$("skyCopy").addEventListener("click", async () => {
  const link = inviteLink();
  try { await navigator.clipboard.writeText(link); note("linkCopied"); } catch { note("copyFail"); }
  renderSky();
});
$("nameIn").addEventListener("input", () => {
  store.set("name", cleanName($("nameIn").value));
  if (role === "host") { if (me) me.name = myName(); sendPeople(); } else if (role === "guest") NET.toHost({ type: "name", name: myName(), ...xOut() });
});
// The X handle: typed by the player, or filled in by signing in with X. Anything that is not a valid X username is
// quietly not used (the field only turns a soft red), and a typed handle never gets the X mark.
$("xIn").addEventListener("input", () => {
  if (xUser) return;
  const raw = $("xIn").value.trim(), h = cleanHandle(raw);
  store.set("xh", h); $("xIn").toggleAttribute("aria-invalid", !!raw && !h);
  xSent();
});
function xSent() {   // tell the sky my handle changed, the same way a name change is told
  if (role === "host") { if (me) { me.xh = myHandle(); me.xok = !!xUser; } sendPeople(); } else if (role === "guest") NET.toHost({ type: "name", name: myName(), ...xOut() });
}
function renderX() {
  const h = myHandle();
  if (document.activeElement !== $("xIn") || xUser) $("xIn").value = h;
  $("xIn").readOnly = !!xUser; $("xIn").toggleAttribute("aria-invalid", false);
  $("xConn").hidden = !xOn; $("xBtn").hidden = !!xUser || online(); $("xOff").hidden = !xUser;   // signing in leaves the page, so not from inside a shared sky
  $("xAt").classList.toggle("xok", !!xUser);
  $("xAva").hidden = !xUser?.pic; if (xUser?.pic && $("xAva").getAttribute("src") !== xUser.pic) $("xAva").src = xUser.pic;
  $("xMsg").textContent = xNote ? t(...xNote) : ""; $("xMsg").hidden = !xNote;
}
let xNote = null;
$("xAva").addEventListener("error", () => { $("xAva").hidden = true; $("resAva").hidden = true; });
$("resAva").addEventListener("error", () => { $("resAva").hidden = true; });
$("xOff").addEventListener("click", async () => {
  await xLogout(); xUser = null; xNote = ["xLeft"]; renderX(); xSent();
});

// ---------- the loop ----------
function tick(now) {
  const gap = (now - last) / 1000, dt = Math.min(0.05, gap); last = now;
  if (!paused) {
    const input = me && me.state === "fly" && !menu && !landing ? readInput(dt) : IDLE;
    if (role === "guest") guestStep(dt, input, now);
    else {
      world.step(dt, input);
      if (role === "host" && document.hidden) for (let k = Math.min(30, Math.floor(gap / 0.05) - 1); k > 0; k--) world.step(0.05, IDLE);   // a hidden tab ticks about once a second: catch up, so the guests' sky keeps moving
      for (const r of world.riders) { if (r.state === "duel") world.duelPose(r, dt); else if (r.remote && r.state === "fly") glide(r, dt); }
    }
    handle(world.drain());
    if (role === "host") hostTick(now);
    if (D) duelUpdate(dt);
    if (me) {
      if (me.state === "fly" && me.lift && world.thermals.some(th => Math.hypot(me.x - th.x, me.z - th.z) < th.r && me.y >= th.top - 4)) quest("ceiling");   // rode rising air to where it ends
      if (++windN % 4 === 0) band.setWind(me.speed);               // the wind follows my speed (a dial turned a few times a second, no new sound)
      if (me.shield > 0 && !hadShield) band.shield(); hadShield = me.shield > 0;
      const ph = Math.floor((me.flap - Math.PI / 2) / (Math.PI * 2)); if (ph !== flapPh) { flapPh = ph; if (me.state === "fly") band.flapSound(); }   // one whoosh per downstroke of the wings
    }
    if (view && !drag) view.camYaw *= 1 - Math.min(1, dt * 2.5);
  }
  view.update(me, paused ? 0 : dt, dueling() ? { x: D.ring.x, y: D.ring.y, z: D.ring.z, yaw: world.t * 0.22 } : null);
  if (me) { hud(dt); if (D) drawLane(); }
  else if (!$("club").hidden && now > boardAt) { boardAt = now + 1000; setText("poolLine", t(world.pool < 1 ? "poolSpent" : "poolLine", { n: fmt(world.pool) })); }   // the pool, live, while choosing
}
function frame(now) { tick(now); requestAnimationFrame(frame); }
setInterval(() => { if (document.hidden && role === "host") tick(performance.now()); }, 250);   // a hidden tab gets no animation frames, and the host must keep the sky going
addEventListener("resize", () => { view?.resize(); sizeLane(); });

// ---------- the splash and the Roost (setup screen) ----------
function applyLang() {
  document.documentElement.lang = lang; document.title = t("title"); if (lang === "ko") window.__koFont?.(); document.querySelector('meta[name="description"]').content = t("desc");
  document.querySelectorAll("[data-en]").forEach(el => { const v = el.dataset[lang] ?? el.dataset.en; if (el.hasAttribute("data-html")) el.innerHTML = v; else el.textContent = v; });
  document.querySelectorAll("#langSeg button, #langSeg2 button").forEach(b => b.classList.toggle("on", b.dataset.v === lang));
  $("loadId").placeholder = lang === "ko" ? "토큰 번호 예: 20001" : "Token ID, e.g. 20001";
  $("skyCode").placeholder = lang === "ko" ? "코드 6자리" : "6-letter code";
  $("muteBtn").textContent = band.muted ? t("soundOff") : t("soundOn");
  pauseLabels();
  if (!$("hud").hidden) $("hint").innerHTML = t(dueling() ? "hintDuel" : online() ? "hintSky" : "hint");
  if ($("guide").open) $("guideOdds").innerHTML = oddsRows();
  shown = chipsShown = ""; coachShown = -1; boardAt = 0; renderSetup(); resNote();
  if (lastRun && !$("result").hidden) { $("resRank").innerHTML = rankHtml(lastRun.rp, lastRun.rankUp); renderShare(); }
}
function pickFriend(f) { myFriend = f; store.set("friend", packFriend(f)); renderSetup(); if (role === "host") sendPeople(); else if (role === "guest") NET.toHost({ type: "name", name: myName(), ...xOut() }); }
function renderSetup() {
  fitPurse();
  const list = myFriend && !pool.some(f => f.id === myFriend.id) ? [myFriend, ...pool.slice(0, 7)] : pool, el = $("pick");
  el.innerHTML = "";
  for (const f of list) {
    const b = document.createElement("button"); b.type = "button"; b.className = f.id === myFriend?.id ? "on" : "";
    b.innerHTML = `<span class="slot"></span><span>#${f.id}</span><em>${f.family}</em>`; b.querySelector(".slot").replaceWith(avatar(f, ""));
    b.addEventListener("click", () => pickFriend(f));
    el.append(b);
  }
  $("dragons").innerHTML = KINDS.map(k => `<button type="button" data-v="${k}" class="${k === myKind ? "on" : ""}"><img src="${thumbs[k] || ""}" alt=""><b>${t(k)}</b><em>${t(k + "T")}</em></button>`).join("");
  // stakes the purse cannot cover are greyed out; flying free is always there
  const have = purse(), cost = itemsCost();
  $("stakeSeg").innerHTML = STAKES.map(v => `<button type="button" data-v="${v}" class="${stake === v ? "on" : ""}" ${v > have ? "disabled" : ""}>${v ? `${v} RF` : t("free")}</button>`).join("");
  $("stakeNote").textContent = stake ? t("stakeRisk", { n: fmt(stake) }) : t("stakeFree");
  document.querySelectorAll("#levelSeg button").forEach(b => b.classList.toggle("on", b.dataset.v === level));
  $("purseLine").textContent = t("purseLine", { n: fmt(have) });
  $("poolLine").textContent = t(world.pool < 1 ? "poolSpent" : "poolLine", { n: fmt(world.pool) });
  $("rankBox").innerHTML = rankHtml();
  $("quests").innerHTML = questsHtml(); $("questSum").textContent = t("questSum", { a: quests().list.filter(e => e.done).length });
  $("shop").innerHTML = Object.keys(ITEMS).map(k => `<button type="button" data-v="${k}" class="${items.includes(k) ? "on" : ""}" ${!items.includes(k) && have < stake + cost + ITEMS[k] ? "disabled" : ""}><b>${t("i_" + k)}</b><em>${t("i_" + k + "T")}</em><span>${ITEMS[k]} RF</span></button>`).join("");
  $("shopSum").textContent = cost ? t("shopSum", { n: fmt(cost) }) : t("shopNone"); $("burnLine").textContent = t("burnLine", { n: fmt(store.get("burnt", 0)) });
  if (myFriend) $("nameIn").placeholder = `${myFriend.family} #${myFriend.id}`;   // the name others see when nothing is typed
  const need = skyTab !== "alone" && !online();                    // a sky has to be open or joined before taking off into it
  $("goBtn").disabled = need; $("goMain").textContent = t("goMain");
  $("goSub").textContent = need ? t("goNeed") : [stake ? t("goCost", { s: fmt(stake) }) : t(cost ? "goFreeShop" : "goFree"), cost ? t("goItems", { i: fmt(cost) }) : ""].filter(Boolean).join(" + ");
  renderSky(); renderX();
}
$("dragons").addEventListener("click", e => { const v = e.target.closest("button")?.dataset.v; if (v) { myKind = v; store.set("dragon", v); renderSetup(); } });
$("stakeSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (b && !b.disabled) { stake = Number(b.dataset.v); store.set("stake", stake); renderSetup(); store.set("items", items); } });
$("shop").addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; const k = b.dataset.v; items = items.includes(k) ? items.filter(x => x !== k) : [...items, k]; store.set("items", items); renderSetup(); });
$("levelSeg").addEventListener("click", e => { const v = e.target.closest("button")?.dataset.v; if (v) { level = v; store.set("level", v); renderSetup(); } });
for (const id of ["langSeg", "langSeg2"]) $(id).addEventListener("click", e => { const v = e.target.closest("button")?.dataset.v; if (v) { lang = v === "ko" ? "ko" : "en"; store.set("lang", lang); applyLang(); } });
$("muteBtn").addEventListener("click", () => { band.setMuted(!band.muted); store.set("muted", band.muted); applyLang(); });
$("goBtn").addEventListener("click", () => { if (myFriend) takeOff(); });
$("playBtn").addEventListener("click", () => { band.ensure(); $("splash").hidden = true; $("club").hidden = false; $("goBtn").focus(); });
$("loadBtn").addEventListener("click", async () => {
  const id = Number($("loadId").value.trim()), msg = $("loadMsg");
  if (!Number.isInteger(id) || id < 1) { msg.textContent = t("enterId"); return; }
  msg.textContent = t("readMsg", { id });
  try { const f = friends.get(id) || addFriend(await loadFriendFromChain(id)); msg.textContent = ""; pickFriend(f); }
  catch (e) { msg.textContent = t(e.key || "loadFail", { id }); }   // chain.js says which of its two refusals it was; anything else is the network
});
$("loadId").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("loadBtn").click(); } });

// Connect X: only when this site's api/x says it has keys. Coming back from X, the page address ends in #x=ok, #x=no
// or #x=err; the profile itself is read from the server, never from the address.
async function xBoot() {
  const back = (location.hash.match(/^#x=(ok|no|err)$/) || [])[1];
  if (back) history.replaceState(null, "", location.pathname + location.search);
  if (!await xStatus()) { if (back) { xNote = ["xErr"]; renderX(); } return; }
  xOn = true; xUser = await xMe();
  if (xUser) { store.set("xh", xUser.username); if (xUser.name && (back === "ok" || !cleanName(store.get("name", "")))) { store.set("name", cleanName(xUser.name)); $("nameIn").value = cleanName(xUser.name); } }
  xNote = back === "ok" && xUser ? ["xOk", { h: xUser.username }] : back === "no" ? ["xNo"] : back ? ["xErr"] : null;
  renderSetup(); renderShare(); xSent();
}
(async function boot() {
  const list = await fetch("friends.json").then(r => r.json());
  list.forEach(addFriend);
  all = [...friends.values()].filter(f => !f.custom);
  const saved = store.get("friend", null); if (saved && typeof saved === "object") addFriend(saved);
  const ids = store.get("pool", []), kept = ids.map(id => friends.get(id)).filter(Boolean);
  pool = kept.length === 8 ? kept : [...all].sort(() => Math.random() - 0.5).slice(0, 8); store.set("pool", pool.map(f => f.id));
  myFriend = (saved && friends.get(typeof saved === "object" ? saved.id : saved)) || pool[0];
  stake = params.has("stake") ? Number(params.get("stake")) : store.get("stake", 0); if (!STAKES.includes(stake)) stake = 0;   // flying free is the default
  items = (params.has("items") ? params.get("items").split(",") : store.get("items", [])).filter((k, i, a) => ITEMS[k] && a.indexOf(k) === i);
  level = store.get("level", "club"); if (!TOL[level]) level = "club";
  myKind = params.get("dragon") || store.get("dragon", "ember"); if (!KINDS.includes(myKind)) myKind = "ember";
  thumbs = dragonThumbs(KINDS);
  lang = params.get("lang") || store.get("lang", "en"); if (lang !== "ko") lang = "en";
  if (params.get("name")) store.set("name", cleanName(params.get("name")));   // test hook
  $("nameIn").value = cleanName(store.get("name", ""));
  world = new World(params.get("seed") || await sha256hex(`dragon-stakes:${randomHex(8)}`), all, params.has("pool") ? Number(params.get("pool")) || 0 : POOL);
  view = new View($("world"), world, sprite); sceneryExtras();
  // an invite link opens the setup screen ready to join with one press
  const room = (params.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (room) { skyTab = "join"; $("skyCode").value = room; note("skyTap", { code: room }); }
  // quests and the shop are folded away on a phone, open on a wide screen
  const wide = matchMedia("(min-width: 900px)").matches; $("questBox").open = wide; $("shopBox").open = wide;
  document.querySelectorAll("#guide details").forEach((d, i) => d.open = !TOUCH || i < 2);   // the how-to: on a phone only how to fly and how to fight are open
  applyLang();
  // The splash comes first for a new visitor. Someone who has flown before, an invite link and the test hooks go straight to the setup screen.
  const splash = params.has("splash") || !(store.get("flown", false) || room || AUTO || params.has("test"));
  $("splash").hidden = !splash; $("club").hidden = splash; (splash ? $("playBtn") : $("goBtn")).focus();
  if (room) $("skyBox").scrollIntoView({ block: "center" });
  requestAnimationFrame(frame);
  xBoot();
  if (AUTO && params.has("go")) {   // test hooks: ?auto&go flies alone, &host opens a sky first, &room=CODE joins one and takes off when the host answers
    if (params.has("host")) { await openSky(); if (role === "host") takeOff(); }
    else if (room) joinSky(room);
    else takeOff();
  }
})();
