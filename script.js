const state = {
  wallet: 1000,
  activeGame: "slots",
  slotsBet: 5,
  crapsBet: 25,
  crapsType: "pass",
  crapsPoint: null,
  crapsPhase: "comeOut",
  rouletteBet: 5,
  rouletteChoice: "red",
  rouletteHistory: [],
  bjBet: 10,
  blackjack: {
    deck: [],
    dealer: [],
    player: [],
    inProgress: false,
    dealerHidden: true,
  },
};

const sessionStats = {
  played: 0,
  wins: 0,
  net: 0,
  history: [],
};

const blackjackRoom = {
  peer: null,
  connection: null,
  role: null,
  code: "",
  guestConnected: false,
  guestWallet: 1000,
  guestBet: 10,
  multiplayer: false,
};

const cardSuits = ["♠", "♥", "♦", "♣"];
const cardColors = { "♠": "black", "♣": "black", "♥": "red", "♦": "red" };
const pipMap = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

const slotSymbols = ["7", "BAR", "🍒", "💎", "🔔", "⭐"];
const rouletteNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const rouletteReds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const diceFacesByResult = {
  1: { 1: 1, 6: 6, 2: 2, 5: 5, 3: 3, 4: 4 },
  2: { 1: 2, 6: 5, 2: 3, 5: 4, 3: 1, 4: 6 },
  3: { 1: 3, 6: 4, 2: 2, 5: 5, 3: 1, 4: 6 },
  4: { 1: 4, 6: 3, 2: 2, 5: 5, 3: 1, 4: 6 },
  5: { 1: 5, 6: 2, 2: 3, 5: 4, 3: 1, 4: 6 },
  6: { 1: 6, 6: 1, 2: 2, 5: 5, 3: 3, 4: 4 },
};
let rouletteWheelRotation = 0;

function formatMoney(value) {
  return `$${value}`;
}

function formatNet(value) {
  if (value > 0) return `+$${value}`;
  if (value < 0) return `-$${Math.abs(value)}`;
  return "$0";
}

function recordGameRound(game, wager, net, outcome) {
  sessionStats.played += 1;
  sessionStats.net += net;
  if (net > 0) sessionStats.wins += 1;
  sessionStats.history.unshift({
    game,
    wager,
    net,
    outcome,
    time: new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
  });
  sessionStats.history.length = Math.min(sessionStats.history.length, 5);
  renderSessionSummary();
}

function renderSessionSummary() {
  document.getElementById("session-played").textContent = sessionStats.played;
  document.getElementById("session-wins").textContent = sessionStats.wins;
  const netElement = document.getElementById("session-net");
  netElement.textContent = formatNet(sessionStats.net);
  netElement.parentElement.classList.toggle("negative", sessionStats.net < 0);

  const list = document.getElementById("session-history");
  document.getElementById("session-history-count").textContent = `${sessionStats.history.length} / 5`;
  list.replaceChildren();
  if (!sessionStats.history.length) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "Zatím bez odehraných kol";
    list.appendChild(empty);
    return;
  }

  sessionStats.history.forEach((entry) => {
    const item = document.createElement("li");
    item.className = `history-item ${entry.net > 0 ? "win" : entry.net < 0 ? "loss" : "push"}`;
    item.title = entry.outcome;
    const time = document.createElement("span");
    time.textContent = entry.time;
    const game = document.createElement("strong");
    game.textContent = entry.game;
    const net = document.createElement("span");
    net.className = "history-net";
    net.textContent = formatNet(entry.net);
    item.append(time, game, net);
    list.appendChild(item);
  });
}

function updateWalletDisplay() {
  document.getElementById("wallet-value").textContent = formatMoney(state.wallet);
  refreshBetControls();
  if (blackjackRoom?.role === "guest" && blackjackRoom.connection?.open) {
    sendBlackjackMessage({ type: "wallet", amount: state.wallet });
  } else if (
    blackjackRoom?.role === "host" &&
    blackjackRoom.connection?.open &&
    !state.blackjack.inProgress
  ) {
    broadcastBlackjackState();
  }
}

function isValidWager(value, balance = state.wallet) {
  return Number.isSafeInteger(value) && value >= 1 && value <= Math.floor(balance);
}

function refreshBetControls() {
  const available = Math.floor(state.wallet);
  document.querySelectorAll(".custom-bet-input").forEach((input) => {
    input.max = available;
  });
  document.querySelectorAll(".slot-bet, .craps-bet-amount, .bj-bet, .roulette-bet").forEach((button) => {
    button.disabled = Number(button.dataset.amount) > available;
  });
}

function showWagerError(game, amount) {
  const message = Number.isFinite(amount) && amount > state.wallet
    ? `Sázka nemůže být vyšší než zůstatek ${formatMoney(state.wallet)}.`
    : "Zadej celé číslo alespoň 1.";
  const statusId = { slots: "slots-status", craps: "craps-status", blackjack: "bj-status", roulette: "roulette-status" }[game];
  document.getElementById(statusId).textContent = message;
}

function switchGame(gameName) {
  state.activeGame = gameName;

  document.querySelectorAll(".game-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.game === gameName);
  });

  document.querySelectorAll(".game-screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `${gameName}-game`);
  });

  document.getElementById("game-stage").classList.add("visible");
  document.getElementById("lobby-view").classList.add("hidden");
}

function returnToLobby() {
  document.getElementById("game-stage").classList.remove("visible");
  document.getElementById("lobby-view").classList.remove("hidden");
}

function setSlotsBet(value) {
  const amount = Number(value);
  if (!isValidWager(amount)) {
    showWagerError("slots", amount);
    return false;
  }
  state.slotsBet = amount;
  document.querySelectorAll(".slot-bet").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.amount) === state.slotsBet);
  });
  return true;
}

function setCrapsWager(value) {
  const amount = Number(value);
  if (!isValidWager(amount)) {
    showWagerError("craps", amount);
    return false;
  }
  state.crapsBet = amount;
  document.querySelectorAll(".craps-bet-amount").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.amount) === state.crapsBet);
  });
  document.getElementById("craps-wager").textContent = formatMoney(state.crapsBet);
  return true;
}

function setCrapsType(type) {
  state.crapsType = type;
  document.querySelectorAll(".craps-bet").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  document.getElementById("craps-bet-type").textContent =
    type === "pass" ? "Pass Line" : type === "dont-pass" ? "Don’t Pass" : "Field";
}

function setRouletteChoice(choice) {
  state.rouletteChoice = choice;
  document.querySelectorAll(".roulette-selection").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.choice === choice);
  });
  updateRouletteDetails();
}

function setBJBet(value) {
  const amount = Number(value);
  if (state.blackjack.inProgress || !isValidWager(amount)) {
    showWagerError("blackjack", amount);
    return false;
  }
  state.bjBet = amount;
  document.querySelectorAll(".bj-bet").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.amount) === state.bjBet);
  });
  if (blackjackRoom.role === "guest") {
    sendBlackjackMessage({ type: "bet", amount: state.bjBet });
  } else if (blackjackRoom.role === "host" && blackjackRoom.connection?.open) {
    broadcastBlackjackState();
  }
  return true;
}

function setRouletteBet(value) {
  const amount = Number(value);
  if (!isValidWager(amount)) {
    showWagerError("roulette", amount);
    return false;
  }
  state.rouletteBet = amount;
  document.querySelectorAll(".roulette-bet").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.amount) === state.rouletteBet);
  });
  updateRouletteDetails();
  return true;
}

function updateRouletteDetails() {
  if (!document.getElementById("roulette-current-bet")) return;
  const labels = {
    red: "Červená",
    black: "Černá",
    even: "Sudá",
    odd: "Lichá",
    low: "1–18",
    high: "19–36",
    "dozen-1": "1. tucet",
    "dozen-2": "2. tucet",
    "dozen-3": "3. tucet",
    "column-1": "1. sloupec",
    "column-2": "2. sloupec",
    "column-3": "3. sloupec",
  };
  const numberMatch = state.rouletteChoice.match(/^number-(\d+)$/);
  const multiplier = numberMatch ? 36 : /^(dozen|column)-/.test(state.rouletteChoice) ? 3 : 2;
  document.getElementById("roulette-current-bet").textContent = formatMoney(state.rouletteBet);
  document.getElementById("roulette-current-choice").textContent = numberMatch ? `Číslo ${numberMatch[1]}` : labels[state.rouletteChoice];
  document.getElementById("roulette-potential-payout").textContent = formatMoney(state.rouletteBet * multiplier);
}

function renderRouletteBoard() {
  const board = document.getElementById("roulette-number-board");
  board.replaceChildren();

  const makeSelection = (choice, label, className, row, column) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `roulette-selection ${className}`;
    button.dataset.choice = choice;
    button.textContent = label;
    button.style.gridRow = row;
    button.style.gridColumn = column;
    button.setAttribute("aria-label", label);
    return button;
  };

  board.appendChild(makeSelection("number-0", "0", "roulette-number green roulette-zero", "1 / 4", "1"));

  for (let number = 1; number <= 36; number += 1) {
    const row = 3 - ((number - 1) % 3);
    const column = Math.ceil(number / 3) + 1;
    const color = rouletteReds.has(number) ? "red" : "black";
    board.appendChild(makeSelection(`number-${number}`, String(number), `roulette-number ${color}`, String(row), String(column)));
  }

  for (let column = 1; column <= 3; column += 1) {
    board.appendChild(makeSelection(`column-${column}`, "2 : 1", "roulette-column-choice", String(column), "14"));
  }

  board.addEventListener("click", (event) => {
    const button = event.target.closest(".roulette-selection");
    if (button) setRouletteChoice(button.dataset.choice);
  });
}

function roulettePayoutMultiplier(choice, result) {
  const numberMatch = choice.match(/^number-(\d+)$/);
  if (numberMatch) return result === Number(numberMatch[1]) ? 36 : 0;
  if (result === 0) return 0;
  if (choice === "red") return rouletteReds.has(result) ? 2 : 0;
  if (choice === "black") return rouletteReds.has(result) ? 0 : 2;
  if (choice === "even") return result % 2 === 0 ? 2 : 0;
  if (choice === "odd") return result % 2 !== 0 ? 2 : 0;
  if (choice === "low") return result <= 18 ? 2 : 0;
  if (choice === "high") return result >= 19 ? 2 : 0;

  const [betGroup, rawIndex] = choice.split("-");
  const betIndex = Number(rawIndex);
  if (betGroup === "dozen") return Math.ceil(result / 12) === betIndex ? 3 : 0;
  if (betGroup === "column") return ((result - 1) % 3) + 1 === betIndex ? 3 : 0;
  return 0;
}

function renderRouletteHistory() {
  const history = document.getElementById("roulette-history");
  history.replaceChildren();
  if (!state.rouletteHistory.length) {
    const empty = document.createElement("li");
    empty.className = "roulette-history-empty";
    empty.textContent = "Kolo ještě nebylo roztočeno";
    history.appendChild(empty);
    return;
  }

  state.rouletteHistory.forEach(({ number, color }) => {
    const item = document.createElement("li");
    item.className = `roulette-history-number ${color}`;
    item.textContent = number;
    history.appendChild(item);
  });
}

function applyCustomBet(game) {
  const input = document.getElementById(`${game}-custom-bet`);
  if (!input) return;
  const amount = Number(input.value);
  const setters = {
    slots: setSlotsBet,
    craps: setCrapsWager,
    blackjack: setBJBet,
    roulette: setRouletteBet,
  };

  if (setters[game](amount)) {
    input.value = "";
  }
}

function renderSlots() {
  const reels = document.querySelectorAll(".reel");
  reels.forEach((reel) => {
    reel.innerHTML = `<div class="reel-symbol">${slotSymbols[Math.floor(Math.random() * slotSymbols.length)]}</div>`;
  });
}

function spinSlots() {
  const bet = state.slotsBet;
  const walletBeforeSpin = state.wallet;
  if (state.wallet < bet) {
    document.getElementById("slots-status").textContent = `Nedostatek peněz. Potřebuješ ${formatMoney(state.slotsBet)}.`;
    return;
  }

  const reelElements = [...document.querySelectorAll(".reel")];
  const results = reelElements.map(() => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
  const stopIndex = 22;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spinTimes = reelElements.map((_, index) => reducedMotion ? 850 + index * 220 : 2100 + index * 620);
  const spinDelays = reelElements.map((_, index) => reducedMotion ? index * 140 : index * 240);
  reelElements.forEach((reel, index) => {
    const strip = document.createElement("div");
    strip.className = "reel-strip";
    const sequence = Array.from({ length: stopIndex }, () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
    sequence.push(results[index]);
    strip.innerHTML = sequence.map((symbol) => `<div class="reel-symbol">${symbol}</div>`).join("");
    strip.style.setProperty("--reel-offset", `-${stopIndex * 150}px`);
    strip.style.setProperty("--reel-duration", `${spinTimes[index]}ms`);
    strip.style.setProperty("--reel-delay", `${spinDelays[index]}ms`);
    reel.replaceChildren(strip);
    reel.classList.add("spinning");
    strip.classList.add("rolling");
  });

  state.wallet -= bet;
  updateWalletDisplay();
  document.getElementById("slots-spin").disabled = true;
  document.querySelectorAll(".slot-bet, #slots-custom-bet, .apply-custom-bet[data-game='slots']").forEach((control) => {
    control.disabled = true;
  });
  document.getElementById("slots-status").textContent = "Válce se roztáčejí…";

  window.setTimeout(() => {
    reelElements.forEach((reel, index) => {
      reel.classList.remove("spinning");
      reel.replaceChildren(Object.assign(document.createElement("div"), {
        className: "reel-symbol",
        textContent: results[index],
      }));
    });
    document.getElementById("slots-spin").disabled = false;
    document.querySelectorAll(".slot-bet, #slots-custom-bet, .apply-custom-bet[data-game='slots']").forEach((control) => {
      control.disabled = false;
    });
    refreshBetControls();

    const [a, b, c] = results;
    let payout = 0;

    if (a === b && b === c) {
      payout = bet * 10;
    } else if (a === b || b === c || a === c) {
      payout = bet * 2;
    }

    if (payout > 0) {
      state.wallet += payout;
      document.getElementById("slots-status").textContent = `Výhra! Vyhrál jsi ${formatMoney(payout)}.`;
    } else {
      document.getElementById("slots-status").textContent = `Prohra! Vypadlo: ${results.join(" | ")}.`;
    }

    recordGameRound("Slots", bet, state.wallet - walletBeforeSpin, document.getElementById("slots-status").textContent);
    updateWalletDisplay();
  }, Math.max(...spinTimes.map((duration, index) => duration + spinDelays[index])) + 100);
}

function renderCripsDice() {
  const diceEls = [document.getElementById("die-1"), document.getElementById("die-2")];
  diceEls.forEach((die, index) => {
    die.innerHTML = "";
    const cube = document.createElement("div");
    cube.className = "die-cube";
    const value = state.crapsDice ? state.crapsDice[index] : 1;
    const faceValues = diceFacesByResult[value];
    cube.style.transform = "rotateX(0deg) rotateY(0deg)";

    for (let facePosition = 1; facePosition <= 6; facePosition += 1) {
      const face = document.createElement("div");
      face.className = "die-face";
      face.dataset.face = facePosition;
      const positions = pipMap[faceValues[facePosition]];

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const pip = document.createElement("span");
          pip.className = "pip";
          if (positions.some(([x, y]) => x === col && y === row)) {
            pip.classList.add("visible");
          }
          face.appendChild(pip);
        }
      }
      cube.appendChild(face);
    }
    die.appendChild(cube);
  });
}

function rollCrapsDice() {
  const rollButton = document.getElementById("craps-roll");
  if (state.wallet < state.crapsBet) {
    document.getElementById("craps-status").textContent = `Nedostatek peněz. Potřebuješ ${formatMoney(state.crapsBet)}.`;
    return;
  }

  const first = Math.floor(Math.random() * 6) + 1;
  const second = Math.floor(Math.random() * 6) + 1;
  const walletBeforeRoll = state.wallet;
  state.crapsDice = [first, second];
  renderCripsDice();
  rollButton.disabled = true;
  document.querySelectorAll(".craps-bet, .craps-bet-amount").forEach((button) => {
    button.disabled = true;
  });

  const cubes = [...document.querySelectorAll(".die-cube")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rollDurations = cubes.map((_, index) => reducedMotion ? 800 + index * 140 : 1550 + index * 260);
  const rollDelays = cubes.map((_, index) => reducedMotion ? index * 100 : index * 140);
  cubes.forEach((cube, index) => {
    const direction = index === 0 ? 1 : -1;
    cube.style.setProperty("--tumble-hop", `${direction * 24}px`);
    cube.style.setProperty("--tumble-drift", `${direction * -13}px`);
    cube.style.setProperty("--tumble-x-mid", `${430 * direction}deg`);
    cube.style.setProperty("--tumble-y-mid", `${510 * direction}deg`);
    cube.style.setProperty("--tumble-x-late", `${900 * direction}deg`);
    cube.style.setProperty("--tumble-y-late", `${1010 * direction}deg`);
    cube.style.setProperty("--tumble-x-end", `${1440 * direction}deg`);
    cube.style.setProperty("--tumble-y-end", `${1800 * direction}deg`);
    cube.style.setProperty("--tumble-duration", `${rollDurations[index]}ms`);
    cube.style.setProperty("--tumble-delay", `${rollDelays[index]}ms`);
    cube.classList.add("rolling");
  });

  document.getElementById("craps-status").textContent = "Kostky se kutálejí…";
  window.setTimeout(() => {
    cubes.forEach((cube) => {
      cube.classList.remove("rolling");
      cube.style.transform = "rotateX(0deg) rotateY(0deg)";
    });
    rollButton.disabled = false;
    document.querySelectorAll(".craps-bet, .craps-bet-amount").forEach((button) => {
      button.disabled = false;
    });
    resolveCrapsRoll(first + second, walletBeforeRoll);
  }, Math.max(...rollDurations.map((duration, index) => duration + rollDelays[index])) + 100);
}

function resolveCrapsRoll(total, walletBeforeRoll) {
  if (state.crapsType === "pass") {
    if (state.crapsPhase === "comeOut") {
      if (total === 7 || total === 11) {
        state.wallet += state.crapsBet;
        state.crapsStatus = `Výhra! ${total} padlo. +${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else if ([2, 3, 12].includes(total)) {
        state.wallet -= state.crapsBet;
        state.crapsStatus = `Prohra! ${total} padlo. -${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else {
        state.crapsPoint = total;
        state.crapsPhase = "point";
        state.crapsStatus = `Bod nastaven na ${total}. Hraje se dál.`;
      }
    } else if (state.crapsPhase === "point") {
      if (total === state.crapsPoint) {
        state.wallet += state.crapsBet;
        state.crapsStatus = `Výhra! Bod ${state.crapsPoint} byl dosažen. +${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else if (total === 7) {
        state.wallet -= state.crapsBet;
        state.crapsStatus = `Prohra! 7 padlo. -${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else {
        state.crapsStatus = `Hraje se dál. ${total} padlo, čekáme na ${state.crapsPoint}.`;
      }
    }
  } else if (state.crapsType === "dont-pass") {
    if (state.crapsPhase === "comeOut") {
      if ([2, 3].includes(total)) {
        state.wallet += state.crapsBet;
        state.crapsStatus = `Výhra! ${total} padlo. +${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else if ([7, 11].includes(total)) {
        state.wallet -= state.crapsBet;
        state.crapsStatus = `Prohra! ${total} padlo. -${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else if (total === 12) {
        state.crapsStatus = `Push! ${total} padlo, sázka se vrací.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else {
        state.crapsPoint = total;
        state.crapsPhase = "point";
        state.crapsStatus = `Don’t Pass čeká na ${total}.`;
      }
    } else if (state.crapsPhase === "point") {
      if (total === state.crapsPoint) {
        state.wallet -= state.crapsBet;
        state.crapsStatus = `Prohra! Bod ${state.crapsPoint} padl. -${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else if (total === 7) {
        state.wallet += state.crapsBet;
        state.crapsStatus = `Výhra! 7 padlo. +${formatMoney(state.crapsBet)}.`;
        state.crapsPoint = null;
        state.crapsPhase = "comeOut";
      } else {
        state.crapsStatus = `Hraje se dál. ${total} padlo, čekáme na ${state.crapsPoint} nebo 7.`;
      }
    }
  } else if (state.crapsType === "field") {
    const wins = [3, 4, 9, 10, 11];
    const doubles = [2, 12];

    if (wins.includes(total)) {
      state.wallet += state.crapsBet;
      state.crapsStatus = `Field vyhrál! ${total} padlo. +${formatMoney(state.crapsBet)}.`;
    } else if (doubles.includes(total)) {
      state.wallet += state.crapsBet * 2;
      state.crapsStatus = `Field jackpot! ${total} padlo. +${formatMoney(state.crapsBet * 2)}.`;
    } else {
      state.wallet -= state.crapsBet;
      state.crapsStatus = `Field prohrál! ${total} padlo. -${formatMoney(state.crapsBet)}.`;
    }
  }

  document.getElementById("craps-status").textContent = state.crapsStatus || "Roll dice";
  document.getElementById("craps-point").textContent = state.crapsPoint === null ? "—" : state.crapsPoint;
  recordGameRound("Craps", state.crapsBet, state.wallet - walletBeforeRoll, state.crapsStatus);
  updateWalletDisplay();
}

function createDeck() {
  const deck = [];
  for (const suit of cardSuits) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ suit, rank, color: cardColors[suit] });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function cardValue(card) {
  if (card.rank === 1) return 11;
  if (card.rank >= 10) return 10;
  return card.rank;
}

function handTotal(cards) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((card) => card.rank === 1).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function renderHand(containerId, cards, hidden = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  cards.forEach((card, index) => {
    if (card === null || (hidden && index === 0)) {
      const back = document.createElement("div");
      back.className = "card";
      back.style.background = "linear-gradient(135deg, #2b72d9, #1d4386)";
      back.style.color = "white";
      back.innerHTML = `<div class="top">?</div><div class="center">♠</div><div class="bottom">?</div>`;
      back.style.setProperty("--card-index", index);
      container.appendChild(back);
      return;
    }

    const el = document.createElement("div");
    el.className = `card ${cardColors[card.suit]}`;
    el.style.setProperty("--card-index", index);
    const label = card.rank === 1 ? "A" : card.rank === 11 ? "J" : card.rank === 12 ? "Q" : card.rank === 13 ? "K" : card.rank;
    el.innerHTML = `<div class="top">${label}</div><div class="center">${card.suit}</div><div class="bottom">${label}</div>`;
    container.appendChild(el);
  });
}

function setBlackjackRoomStatus(message) {
  document.getElementById("bj-room-status").textContent = message;
}

function sendBlackjackMessage(message) {
  if (blackjackRoom.connection?.open) {
    blackjackRoom.connection.send(message);
  }
}

function createBlackjackRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function connectBlackjackPeer(peerConnection, role) {
  blackjackRoom.connection = peerConnection;
  blackjackRoom.role = role;

  peerConnection.on("open", () => {
    if (role === "guest") {
      setBlackjackRoomStatus("Připojeno ke stolu. Čekáš, až host rozdá karty.");
      sendBlackjackMessage({ type: "join", wallet: state.wallet, bet: state.bjBet });
    } else {
      blackjackRoom.guestConnected = true;
      document.getElementById("bj-guest-seat").hidden = false;
      setBlackjackRoomStatus("Kamarád je u stolu. Host může rozdat karty.");
      broadcastBlackjackState();
    }
  });

  peerConnection.on("data", (message) => {
    if (role === "host") {
      if (message?.type === "join") {
        blackjackRoom.guestWallet = Math.max(0, Number(message.wallet) || 0);
        blackjackRoom.guestBet = Number(message.bet) || 10;
        blackjackRoom.guestConnected = true;
        document.getElementById("bj-guest-seat").hidden = false;
        setBlackjackRoomStatus("Kamarád je u stolu. Host může rozdat karty.");
        broadcastBlackjackState();
      } else if (message?.type === "bet" && isValidWager(Number(message.amount), blackjackRoom.guestWallet)) {
        blackjackRoom.guestBet = Number(message.amount);
        broadcastBlackjackState();
      } else if (message?.type === "wallet" && Number.isFinite(Number(message.amount))) {
        blackjackRoom.guestWallet = Math.max(0, Number(message.amount));
        if (!state.blackjack.inProgress) broadcastBlackjackState();
      } else if (message?.type === "action" && ["hit", "stand"].includes(message.action)) {
        playMultiplayerBlackjack("guest", message.action);
      }
      return;
    }

    if (message?.type === "state") {
      renderRemoteBlackjackState(message);
    }
  });

  peerConnection.on("close", () => {
    if (role === "host") {
      blackjackRoom.guestConnected = false;
      document.getElementById("bj-guest-seat").hidden = true;
      setBlackjackRoomStatus("Kamarád se odpojil od stolu.");
    } else {
      setBlackjackRoomStatus("Spojení se stolem bylo přerušeno.");
    }
  });

  peerConnection.on("error", () => {
    setBlackjackRoomStatus("Spojení se nepodařilo. Zkontroluj kód a zkus to znovu.");
  });
}

function hostBlackjackRoom() {
  if (typeof Peer === "undefined") {
    setBlackjackRoomRoomError("Online knihovna se nenačetla. Obnov stránku a zkus to znovu.");
    return;
  }

  closeBlackjackPeer();
  const code = createBlackjackRoomCode();
  const peer = new Peer(`royal-flush-${code}`);
  blackjackRoom.peer = peer;
  blackjackRoom.role = "host";
  blackjackRoom.code = code;
  blackjackRoom.guestConnected = false;
  blackjackRoom.multiplayer = true;
  blackjackRoom.guestWallet = 1000;
  state.blackjack = {
    deck: [],
    dealer: [],
    player: [],
    guestPlayer: [],
    inProgress: false,
    phase: "waiting",
    activePlayer: null,
    status: "Čeká se na kamaráda.",
  };

  const display = document.getElementById("bj-room-display");
  display.textContent = `KÓD: ${code}`;
  display.hidden = false;
  document.getElementById("bj-guest-seat").hidden = true;
  document.getElementById("bj-deal").disabled = true;
  renderHand("dealer-cards", []);
  renderHand("player-cards", []);
  renderHand("guest-cards", []);
  document.getElementById("bj-status").textContent = state.blackjack.status;
  setBlackjackRoomStatus("Vytvářím online stůl…");

  peer.on("open", () => {
    setBlackjackRoomStatus("Stůl je otevřený. Pošli kamarádovi kód místnosti.");
  });

  peer.on("connection", (connection) => {
    if (blackjackRoom.guestConnected) {
      connection.close();
      return;
    }
    connectBlackjackPeer(connection, "host");
  });

  peer.on("error", () => {
    setBlackjackRoomStatus("Místnost se nepodařila vytvořit. Zkus vytvořit nový stůl.");
  });
}

function joinBlackjackRoom() {
  if (typeof Peer === "undefined") {
    setBlackjackRoomRoomError("Online knihovna se nenačetla. Obnov stránku a zkus to znovu.");
    return;
  }

  const code = document.getElementById("bj-room-code").value.trim();
  if (!/^\d{6}$/.test(code)) {
    setBlackjackRoomStatus("Zadej šestimístný kód místnosti.");
    return;
  }

  closeBlackjackPeer();
  blackjackRoom.role = "guest";
  blackjackRoom.code = code;
  blackjackRoom.multiplayer = true;
  document.getElementById("bj-room-display").hidden = true;
  setBlackjackRoomStatus("Připojuji se ke stolu…");

  const peer = new Peer();
  blackjackRoom.peer = peer;
  peer.on("open", () => {
    const connection = peer.connect(`royal-flush-${code}`, { reliable: true });
    connectBlackjackPeer(connection, "guest");
  });
  peer.on("error", () => {
    setBlackjackRoomStatus("Místnost nenalezena nebo už není dostupná. Zkontroluj kód.");
  });
}

function closeBlackjackPeer() {
  blackjackRoom.connection?.close();
  blackjackRoom.peer?.destroy();
  blackjackRoom.connection = null;
  blackjackRoom.peer = null;
  blackjackRoom.guestConnected = false;
}

function setBlackjackRoomRoomError(message) {
  setBlackjackRoomStatus(message);
}

function broadcastBlackjackState() {
  if (blackjackRoom.role !== "host" || !blackjackRoom.connection?.open) return;

  const game = state.blackjack;
  const dealerCards = game.inProgress ? [null, ...game.dealer.slice(1)] : game.dealer;
  const message = {
    type: "state",
    phase: game.phase || "waiting",
    activePlayer: game.activePlayer || null,
    dealer: dealerCards,
    hostCards: game.player,
    guestCards: game.guestPlayer || [],
    hostBet: state.bjBet,
    guestBet: blackjackRoom.guestBet,
    hostWallet: state.wallet,
    guestWallet: blackjackRoom.guestWallet,
    status: game.status || "Čeká se na rozdání.",
  };
  renderRemoteBlackjackState(message, "host");
  blackjackRoom.connection.send(message);
}

function renderRemoteBlackjackState(message, role = blackjackRoom.role) {
  if (!message || !role) return;

  const isHost = role === "host";
  state.wallet = isHost ? message.hostWallet : message.guestWallet;
  state.bjBet = isHost ? message.hostBet : message.guestBet;
  state.blackjack.inProgress = message.phase === "playing";
  document.getElementById("wallet-value").textContent = formatMoney(state.wallet);
  refreshBetControls();
  document.querySelectorAll(".bj-bet").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.amount) === state.bjBet);
  });

  renderHand("dealer-cards", message.dealer || []);
  renderHand("player-cards", message.hostCards || []);
  renderHand("guest-cards", message.guestCards || []);
  document.getElementById("bj-status").textContent = message.status;
  document.getElementById("bj-host-seat").querySelector("h4").textContent = isHost ? "Ty (host)" : "Hostitel";
  document.getElementById("bj-guest-seat").querySelector("h4").textContent = isHost ? "Kamarád" : "Ty";
  document.getElementById("bj-guest-seat").hidden = !isHost && !message.guestCards?.length;

  const myTurn = message.phase === "playing" && message.activePlayer === role;
  document.getElementById("bj-deal").disabled = !isHost || message.phase === "playing" || !blackjackRoom.guestConnected;
  document.getElementById("bj-hit").disabled = !myTurn;
  document.getElementById("bj-stand").disabled = !myTurn;
  document.querySelectorAll(".bj-bet").forEach((button) => {
    button.disabled = message.phase === "playing";
  });
}

function startMultiplayerBlackjack() {
  if (!blackjackRoom.guestConnected) {
    setBlackjackRoomStatus("Nejdřív počkej, až se kamarád připojí.");
    return;
  }

  if (state.wallet < state.bjBet || blackjackRoom.guestWallet < blackjackRoom.guestBet) {
    document.getElementById("bj-status").textContent = "Jeden z hráčů nemá dost peněz na zvolenou sázku.";
    return;
  }

  state.wallet -= state.bjBet;
  blackjackRoom.guestWallet -= blackjackRoom.guestBet;
  state.blackjack = {
    deck: createDeck(),
    dealer: [],
    player: [],
    guestPlayer: [],
    inProgress: true,
    phase: "playing",
    activePlayer: "host",
    status: "Host začíná. Až dohraje, bude na řadě kamarád.",
  };
  state.blackjack.player.push(state.blackjack.deck.pop(), state.blackjack.deck.pop());
  state.blackjack.guestPlayer.push(state.blackjack.deck.pop(), state.blackjack.deck.pop());
  state.blackjack.dealer.push(state.blackjack.deck.pop(), state.blackjack.deck.pop());
  broadcastBlackjackState();
}

function playMultiplayerBlackjack(player, action) {
  const game = state.blackjack;
  if (!game.inProgress || game.activePlayer !== player) return;

  const hand = player === "host" ? game.player : game.guestPlayer;
  if (action === "hit") {
    hand.push(game.deck.pop());
    if (handTotal(hand) > 21) {
      game.status = `${player === "host" ? "Host" : "Kamarád"} má přes 21. Na řadě je další hráč.`;
      advanceBlackjackTurn(player);
    } else {
      game.status = `${player === "host" ? "Host" : "Kamarád"} si lízne kartu.`;
    }
  } else {
    game.status = `${player === "host" ? "Host" : "Kamarád"} stojí.`;
    advanceBlackjackTurn(player);
  }

  broadcastBlackjackState();
}

function advanceBlackjackTurn(player) {
  const game = state.blackjack;
  if (player === "host") {
    game.activePlayer = "guest";
    game.status += " Teď hraje kamarád.";
    return;
  }

  while (handTotal(game.dealer) < 17) {
    game.dealer.push(game.deck.pop());
  }

  const dealerTotal = handTotal(game.dealer);
  const outcomes = [
    { name: "Host", hand: game.player, bet: state.bjBet, balance: "hostWallet" },
    { name: "Kamarád", hand: game.guestPlayer, bet: blackjackRoom.guestBet, balance: "guestWallet" },
  ];
  const results = outcomes.map((playerResult) => {
    const total = handTotal(playerResult.hand);
    if (total > 21 || (dealerTotal <= 21 && dealerTotal >= total)) {
      return `${playerResult.name}: prohra (${total})`;
    }
    if (dealerTotal > 21 || total > dealerTotal) {
      if (playerResult.balance === "hostWallet") state.wallet += playerResult.bet * 2;
      else blackjackRoom.guestWallet += playerResult.bet * 2;
      return `${playerResult.name}: výhra (${total})`;
    }
    if (playerResult.balance === "hostWallet") state.wallet += playerResult.bet;
    else blackjackRoom.guestWallet += playerResult.bet;
    return `${playerResult.name}: remíza (${total})`;
  });

  game.phase = "finished";
  game.inProgress = false;
  game.activePlayer = null;
  game.status = `Dealer má ${dealerTotal}. ${results.join(" · ")}.`;
}

function startBlackjack() {
  if (blackjackRoom.role === "guest") {
    setBlackjackRoomStatus("Hostitel rozdává nové kolo.");
    return;
  }
  if (blackjackRoom.role === "host" && blackjackRoom.multiplayer) {
    startMultiplayerBlackjack();
    return;
  }

  if (state.wallet < state.bjBet) {
    document.getElementById("bj-status").textContent = `Nedostatek peněz. Potřebuješ ${formatMoney(state.bjBet)}.`;
    return;
  }

  const walletBeforeRound = state.wallet;
  state.wallet -= state.bjBet;
  updateWalletDisplay();

  state.blackjack = {
    deck: createDeck(),
    dealer: [],
    player: [],
    inProgress: true,
    dealerHidden: true,
    walletBeforeRound,
  };

  state.blackjack.player.push(state.blackjack.deck.pop(), state.blackjack.deck.pop());
  state.blackjack.dealer.push(state.blackjack.deck.pop(), state.blackjack.deck.pop());

  renderHand("player-cards", state.blackjack.player);
  renderHand("dealer-cards", state.blackjack.dealer, true);
  document.getElementById("bj-status").textContent = "Hraješ. Vyber Hit nebo Stand.";
}

function dealerTurn() {
  const { deck, dealer, player } = state.blackjack;
  state.blackjack.dealerHidden = false;
  renderHand("dealer-cards", dealer, false);

  while (handTotal(dealer) < 17) {
    dealer.push(deck.pop());
  }

  renderHand("dealer-cards", dealer, false);

  const playerTotal = handTotal(player);
  const dealerTotal = handTotal(dealer);

  if (playerTotal > 21 || (dealerTotal <= 21 && dealerTotal >= playerTotal)) {
    document.getElementById("bj-status").textContent = `Prohra. Dealer má ${dealerTotal}, ty ${playerTotal}.`;
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    const payout = state.bjBet * 2;
    state.wallet += payout;
    document.getElementById("bj-status").textContent = `Výhra! Ty máš ${playerTotal}, dealer ${dealerTotal}. +${formatMoney(state.bjBet)}.`;
  } else {
    state.wallet += state.bjBet;
    document.getElementById("bj-status").textContent = `Push. Oboje ${playerTotal}. Vrací se sázka.`;
  }

  state.blackjack.inProgress = false;
  recordGameRound("Blackjack", state.bjBet, state.wallet - state.blackjack.walletBeforeRound, document.getElementById("bj-status").textContent);
  updateWalletDisplay();
}

function hitBlackjack() {
  if (blackjackRoom.role === "guest") {
    sendBlackjackMessage({ type: "action", action: "hit" });
    return;
  }
  if (blackjackRoom.role === "host" && blackjackRoom.multiplayer) {
    playMultiplayerBlackjack("host", "hit");
    return;
  }

  if (!state.blackjack.inProgress) {
    document.getElementById("bj-status").textContent = "Rozdej novou ruku.";
    return;
  }

  state.blackjack.player.push(state.blackjack.deck.pop());
  renderHand("player-cards", state.blackjack.player);

  if (handTotal(state.blackjack.player) > 21) {
    state.blackjack.dealerHidden = false;
    renderHand("dealer-cards", state.blackjack.dealer, false);
    document.getElementById("bj-status").textContent = `Přetížení! Máš ${handTotal(state.blackjack.player)}.`;
    state.blackjack.inProgress = false;
    recordGameRound("Blackjack", state.bjBet, state.wallet - state.blackjack.walletBeforeRound, document.getElementById("bj-status").textContent);
    updateWalletDisplay();
  }
}

function standBlackjack() {
  if (blackjackRoom.role === "guest") {
    sendBlackjackMessage({ type: "action", action: "stand" });
    return;
  }
  if (blackjackRoom.role === "host" && blackjackRoom.multiplayer) {
    playMultiplayerBlackjack("host", "stand");
    return;
  }

  if (!state.blackjack.inProgress) {
    document.getElementById("bj-status").textContent = "Rozdej novou ruku.";
    return;
  }

  dealerTurn();
}

function spinRoulette() {
  if (state.wallet < state.rouletteBet) {
    document.getElementById("roulette-status").textContent = `Nedostatek peněz. Potřebuješ ${formatMoney(state.rouletteBet)}.`;
    return;
  }

  const result = rouletteNumbers[Math.floor(Math.random() * rouletteNumbers.length)];
  const bet = state.rouletteBet;
  const walletBeforeSpin = state.wallet;
  const choice = state.rouletteChoice;
  const pocketIndex = rouletteNumbers.indexOf(result);
  const segmentAngle = 360 / rouletteNumbers.length;
  const wheel = document.getElementById("roulette-wheel");
  const ballOrbit = document.getElementById("roulette-ball-orbit");
  const ball = document.getElementById("roulette-ball");
  const spinButton = document.getElementById("roulette-spin");
  spinButton.disabled = true;
  document.querySelectorAll(".roulette-bet, .roulette-selection").forEach((button) => {
    button.disabled = true;
  });

  const currentRotation = rouletteWheelRotation;
  const pointerCorrection = (currentRotation + pocketIndex * segmentAngle) % 360;
  const rotationDelta = 360 * 7 + (360 - pointerCorrection) % 360;
  const targetRotation = currentRotation + rotationDelta;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wheelDuration = reducedMotion ? 1900 : 6800;
  const ballDuration = reducedMotion ? 1750 : 6300;
  const ballEndRotation = -targetRotation - 360 * 12;
  const ballStartRotation = -currentRotation;
  const ballMidRotation = -targetRotation - 360 * 11;

  wheel.style.setProperty("--wheel-start", `${currentRotation}deg`);
  wheel.style.setProperty("--wheel-mid", `${currentRotation + rotationDelta * 0.84}deg`);
  wheel.style.setProperty("--wheel-end", `${targetRotation}deg`);
  wheel.style.setProperty("--wheel-duration", `${wheelDuration}ms`);
  wheel.classList.add("spinning");

  ballOrbit.style.transform = `rotate(${-currentRotation}deg)`;
  ballOrbit.style.setProperty("--ball-start", `${ballStartRotation}deg`);
  ballOrbit.style.setProperty("--ball-mid", `${ballMidRotation}deg`);
  ballOrbit.style.setProperty("--ball-end", `${ballEndRotation}deg`);
  ballOrbit.style.setProperty("--ball-duration", `${ballDuration}ms`);
  ballOrbit.classList.add("spinning");
  ball.style.top = "5%";
  ball.style.transform = "translate(-50%, -50%) scale(1)";

  document.getElementById("roulette-status").textContent = "Kulička obíhá po dráze…";
  window.setTimeout(() => {
    rouletteWheelRotation = targetRotation;
    wheel.style.transform = `rotate(${targetRotation}deg)`;
    ballOrbit.style.transform = `rotate(${-targetRotation}deg)`;
    wheel.classList.remove("spinning");
    ballOrbit.classList.remove("spinning");
    ball.classList.add("dropping");

    window.setTimeout(() => {
      ball.classList.remove("dropping");
    ball.style.top = "10.5%";
    ball.style.transform = "translate(-50%, -50%) scale(0.82)";
    state.wallet -= bet;

    const color = result === 0 ? "green" : rouletteReds.has(result) ? "red" : "black";
    const payoutMultiplier = roulettePayoutMultiplier(choice, result);
    const win = payoutMultiplier > 0;
    const payout = bet * payoutMultiplier;

    spinButton.disabled = false;
    document.querySelectorAll(".roulette-bet, .roulette-selection").forEach((button) => {
      button.disabled = false;
    });
    document.getElementById("roulette-result").textContent = result;
    document.getElementById("roulette-result").style.color = color === "red" ? "#ff8585" : color === "black" ? "#f9f1e5" : "#84e6ad";
    state.rouletteHistory.unshift({ number: result, color });
    state.rouletteHistory.length = Math.min(state.rouletteHistory.length, 12);
    renderRouletteHistory();

    if (win) {
      state.wallet += payout;
      document.getElementById("roulette-status").textContent = `Výhra! Kolo padlo na ${result}. Vyhrál jsi ${formatMoney(payout)}.`;
    } else {
      document.getElementById("roulette-status").textContent = `Prohra! Kolo padlo na ${result}. Ztráta ${formatMoney(bet)}.`;
    }
    recordGameRound("Roulette", bet, state.wallet - walletBeforeSpin, document.getElementById("roulette-status").textContent);
    updateWalletDisplay();
    }, reducedMotion ? 520 : 740);
  }, wheelDuration + 100);

  window.setTimeout(() => {
    spinButton.disabled = false;
    document.querySelectorAll(".roulette-bet, .roulette-selection").forEach((button) => {
      button.disabled = false;
    });
  }, wheelDuration + (reducedMotion ? 620 : 840));
}

function renderRoulettePockets() {
  const pockets = document.getElementById("roulette-pockets");
  const segmentAngle = 360 / rouletteNumbers.length;
  pockets.innerHTML = "";

  rouletteNumbers.forEach((number, index) => {
    const pocket = document.createElement("span");
    pocket.className = `roulette-pocket ${number === 0 ? "green" : rouletteReds.has(number) ? "red" : "black"}`;
    pocket.textContent = number;
    pocket.style.transform = `rotate(${index * segmentAngle}deg) translateY(-100%)`;
    pockets.appendChild(pocket);
  });
}

function initializeCasino() {
  updateWalletDisplay();
  renderSessionSummary();

  document.querySelectorAll(".game-card").forEach((card) => {
    card.addEventListener("click", () => switchGame(card.dataset.game));
  });

  document.getElementById("back-to-lobby").addEventListener("click", returnToLobby);

  document.querySelectorAll(".game-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchGame(btn.dataset.game));
  });

  document.getElementById("bj-host").addEventListener("click", hostBlackjackRoom);
  document.getElementById("bj-join").addEventListener("click", joinBlackjackRoom);
  document.getElementById("bj-room-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
  });

  document.querySelectorAll(".slot-bet").forEach((btn) => {
    btn.addEventListener("click", () => setSlotsBet(btn.dataset.amount));
  });

  document.querySelectorAll(".craps-bet-amount").forEach((btn) => {
    btn.addEventListener("click", () => setCrapsWager(btn.dataset.amount));
  });

  document.querySelectorAll(".craps-bet").forEach((btn) => {
    btn.addEventListener("click", () => setCrapsType(btn.dataset.type));
  });

  document.querySelectorAll(".bj-bet").forEach((btn) => {
    btn.addEventListener("click", () => setBJBet(btn.dataset.amount));
  });

  document.querySelectorAll(".apply-custom-bet").forEach((button) => {
    button.addEventListener("click", () => applyCustomBet(button.dataset.game));
  });

  document.querySelectorAll(".custom-bet-input").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        document.querySelector(`.apply-custom-bet[data-game="${input.id.replace("-custom-bet", "")}"]`)?.click();
      }
    });
  });

  document.querySelectorAll(".roulette-bet").forEach((btn) => {
    btn.addEventListener("click", () => setRouletteBet(btn.dataset.amount));
  });

  document.querySelectorAll(".roulette-outside-row .roulette-selection").forEach((btn) => {
    btn.addEventListener("click", () => setRouletteChoice(btn.dataset.choice));
  });

  document.getElementById("slots-spin").addEventListener("click", spinSlots);
  document.getElementById("craps-roll").addEventListener("click", rollCrapsDice);
  document.getElementById("bj-deal").addEventListener("click", startBlackjack);
  document.getElementById("bj-hit").addEventListener("click", hitBlackjack);
  document.getElementById("bj-stand").addEventListener("click", standBlackjack);
  document.getElementById("roulette-spin").addEventListener("click", spinRoulette);

  setSlotsBet(5);
  setCrapsWager(25);
  setCrapsType("pass");
  setBJBet(10);
  setRouletteBet(5);
  renderRouletteBoard();
  setRouletteChoice("red");

  renderSlots();
  renderCripsDice();
  renderRoulettePockets();
  renderRouletteHistory();
  updateRouletteDetails();
  renderHand("player-cards", []);
  renderHand("dealer-cards", []);
  renderHand("guest-cards", []);
}

initializeCasino();
