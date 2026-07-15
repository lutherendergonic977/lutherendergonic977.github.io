(() => {
  const arena = document.querySelector("[data-arena]");
  const playerEl = document.querySelector("[data-player]");
  const scoreEl = document.querySelector("[data-score]");
  const bestEl = document.querySelector("[data-best]");
  const livesEl = document.querySelector("[data-lives]");
  const levelEl = document.querySelector("[data-level]");
  const statusEl = document.querySelector("[data-status]");
  const actionButtons = document.querySelectorAll("[data-action]");
  const moveButtons = document.querySelectorAll("[data-move]");

  if (!arena || !playerEl || !scoreEl || !bestEl || !livesEl || !levelEl || !statusEl) {
    return;
  }

  const storageKey = "junghoonjoo-balloon-high-score";
  const controls = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };
  const opposite = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };
  const balloonShapes = ["balloon-round", "balloon-oval", "balloon-diamond", "balloon-star"];
  const balloonTypes = [
    { type: "score", label: "10", className: "balloon-score", value: 10 },
    { type: "score", label: "20", className: "balloon-score", value: 20 },
    { type: "heart", label: "♥", className: "balloon-heart", value: 0 },
    { type: "growth", label: "G", className: "balloon-growth", value: 0 },
  ];

  const state = {
    running: false,
    paused: false,
    over: false,
    rafId: 0,
    lastFrame: 0,
    spawnClock: 0,
    score: 0,
    best: Number(localStorage.getItem(storageKey) || 0),
    lives: 3,
    level: 1,
    speed: 88,
    spawnInterval: 1200,
    move: null,
    lastDirection: "none",
    balloons: [],
    arrows: [],
    loopToken: 0,
    lastShotAt: 0,
    player: {
      x: 0.5,
      y: 0.88,
      width: 0.12,
      height: 0.08,
      speed: 0.38,
      growth: 0,
    },
  };

  function arenaRect() {
    return arena.getBoundingClientRect();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function syncHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    livesEl.textContent = String(state.lives);
    levelEl.textContent = String(state.level);
  }

  function persistBest() {
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(storageKey, String(state.best));
    }
  }

  function renderPlayer() {
    const rect = arenaRect();
    const width = rect.width * state.player.width;
    const height = rect.height * state.player.height;
    const x = clamp(state.player.x * rect.width - width / 2, 8, rect.width - width - 8);
    const y = clamp(state.player.y * rect.height - height / 2, 8, rect.height - height - 8);
    playerEl.style.width = `${width}px`;
    playerEl.style.height = `${height}px`;
    playerEl.style.left = `${x}px`;
    playerEl.style.top = `${y}px`;
  }

  function renderBalloon(balloon) {
    const rect = arenaRect();
    const width = balloon.size;
    const height = balloon.height;
    const x = balloon.x * rect.width - width / 2;
    const y = balloon.y * rect.height - height / 2;
    balloon.el.style.width = `${width}px`;
    balloon.el.style.height = `${height}px`;
    balloon.el.style.transform = `translate(${x}px, ${y}px) rotate(${balloon.spin * balloon.y * 180}deg)`;
  }

  function renderArrow(arrow) {
    const rect = arenaRect();
    const x = arrow.x * rect.width - arrow.width / 2;
    const y = arrow.y * rect.height - arrow.height / 2;
    arrow.el.style.width = `${arrow.width}px`;
    arrow.el.style.height = `${arrow.height}px`;
    arrow.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function clearEntities(list) {
    for (const entity of list) {
      entity.el.remove();
    }
    list.length = 0;
  }

  function resetPlayer() {
    state.player = {
      x: 0.5,
      y: 0.88,
      width: 0.12,
      height: 0.08,
      speed: 0.38,
      growth: 0,
    };
    state.lastDirection = "none";
    state.move = null;
  }

  function updatePlayerShape() {
    state.player.width = clamp(0.12 + state.player.growth * 0.015, 0.12, 0.24);
  }

  function resetGame({ keepReadyStatus = true, seedBalloons = true } = {}) {
    cancelLoop();
    state.running = false;
    state.paused = false;
    state.over = false;
    state.lastFrame = 0;
    state.spawnClock = 0;
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.speed = 88;
    state.spawnInterval = 1200;
    state.lastShotAt = 0;
    clearEntities(state.balloons);
    clearEntities(state.arrows);
    resetPlayer();
    updatePlayerShape();
    syncHud();
    if (keepReadyStatus) {
      setStatus("Ready");
    }
    renderPlayer();
    if (seedBalloons) {
      spawnInitialBalloons();
    }
  }

  function cancelLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  function scheduleLoop() {
    cancelLoop();
    const token = state.loopToken;
    state.rafId = requestAnimationFrame((timestamp) => {
      if (token !== state.loopToken) {
        return;
      }
      state.rafId = 0;
      loop(timestamp);
    });
  }

  function startGame() {
    if (state.over) {
      resetGame({ keepReadyStatus: false, seedBalloons: true });
    }
    if (state.running && !state.paused) {
      return;
    }
    state.running = true;
    state.paused = false;
    state.loopToken += 1;
    state.lastFrame = 0;
    state.spawnClock = Math.max(state.spawnClock, 250);
    if (state.balloons.length === 0) {
      spawnInitialBalloons();
    }
    setStatus("Running");
    scheduleLoop();
  }

  function pauseGame() {
    if (!state.running || state.over) {
      return;
    }
    state.paused = !state.paused;
    state.loopToken += 1;
    if (state.paused) {
      cancelLoop();
      setStatus("Paused");
    } else {
      state.lastFrame = 0;
      setStatus("Running");
      scheduleLoop();
    }
  }

  function restartGame() {
    resetGame({ keepReadyStatus: false, seedBalloons: true });
    state.running = true;
    state.paused = false;
    state.loopToken += 1;
    setStatus("Running");
    scheduleLoop();
  }

  function directionAllowed(next) {
    if (!next) {
      return false;
    }
    if (state.lastDirection === "none") {
      return true;
    }
    return opposite[state.lastDirection] !== next;
  }

  function setMove(direction) {
    if (!controls[direction] || !directionAllowed(direction)) {
      return;
    }
    state.move = direction;
    state.lastDirection = direction;
    if (!state.running && !state.over) {
      startGame();
    }
  }

  function stopMove(direction) {
    if (state.move === direction) {
      state.move = null;
    }
  }

  function spawnBalloon({ visible = false } = {}) {
    const typeMeta = balloonTypes[Math.floor(Math.random() * balloonTypes.length)];
    const shapeClass = balloonShapes[Math.floor(Math.random() * balloonShapes.length)];
    const wobbleClass = ["balloon-pulse", "balloon-float", "balloon-bounce"][Math.floor(Math.random() * 3)];
    const size = 44 + Math.random() * 28;
    const height = size * (typeMeta.type === "score" ? 1.18 : 1);
    const el = document.createElement("div");
    el.className = `balloon ${typeMeta.className} ${shapeClass} ${wobbleClass}`;
    el.textContent = typeMeta.label;
    arena.appendChild(el);

    const balloon = {
      el,
      type: typeMeta.type,
      value: typeMeta.value,
      x: clamp(0.08 + Math.random() * 0.84, 0.08, 0.92),
      y: visible ? 0.1 + Math.random() * 0.18 : -0.14,
      size,
      height,
      speed: state.speed * (0.72 + Math.random() * 0.55),
      drift: (Math.random() - 0.5) * 0.1,
      spin: (Math.random() - 0.5) * 1.2,
      lifeBonus: typeMeta.type === "heart" ? 1 : 0,
      growthBonus: typeMeta.type === "growth" ? 1 : 0,
    };

    state.balloons.push(balloon);
    renderBalloon(balloon);
    return balloon;
  }

  function spawnInitialBalloons() {
    if (state.balloons.length > 0) {
      return;
    }
    spawnBalloon({ visible: true });
    spawnBalloon({ visible: true });
  }

  function fireArrow() {
    if (state.over) {
      return;
    }
    if (!state.running) {
      startGame();
    }
    if (state.paused) {
      return;
    }
    const now = performance.now();
    if (now - state.lastShotAt < 180) {
      return;
    }
    state.lastShotAt = now;

    const el = document.createElement("div");
    el.className = "arrow";
    arena.appendChild(el);

    const arrow = {
      el,
      x: state.player.x,
      y: state.player.y - state.player.height / 2 + 0.01,
      width: 12,
      height: 26,
      speed: 0.9,
    };

    state.arrows.push(arrow);
    renderArrow(arrow);
  }

  function addScore(points) {
    state.score += points;
    persistBest();
    const nextLevel = Math.floor(state.score / 100) + 1;
    if (nextLevel > state.level) {
      state.level = nextLevel;
      state.speed = 88 + (state.level - 1) * 18;
      state.spawnInterval = Math.max(520, 1200 - (state.level - 1) * 130);
      state.player.speed = 0.38 + (state.level - 1) * 0.015;
      state.player.growth = Math.min(5, state.player.growth + 1);
      updatePlayerShape();
      setStatus(`Level ${state.level}`);
    }
    syncHud();
  }

  function addLife(amount = 1) {
    state.lives = clamp(state.lives + amount, 0, 5);
    syncHud();
  }

  function loseLife() {
    state.lives -= 1;
    syncHud();
    if (state.lives <= 0) {
      endGame();
    } else {
      setStatus("Missed balloon");
    }
  }

  function endGame() {
    state.running = false;
    state.paused = false;
    state.over = true;
    persistBest();
    syncHud();
    setStatus("Game Over");
    cancelLoop();
  }

  function resolveBalloonHit(balloon) {
    if (balloon.type === "score") {
      addScore(balloon.value);
    } else if (balloon.type === "heart") {
      addLife(balloon.lifeBonus);
      addScore(15);
    } else if (balloon.type === "growth") {
      state.player.growth = Math.min(5, state.player.growth + 1);
      updatePlayerShape();
      addScore(20);
    }
    balloon.el.remove();
  }

  function rectsIntersect(a, b) {
    return !(
      a.x + a.w < b.x ||
      a.x > b.x + b.w ||
      a.y + a.h < b.y ||
      a.y > b.y + b.h
    );
  }

  function balloonBounds(balloon, rect) {
    return {
      x: balloon.x * rect.width - balloon.size / 2,
      y: balloon.y * rect.height - balloon.height / 2,
      w: balloon.size,
      h: balloon.height,
    };
  }

  function arrowBounds(arrow, rect) {
    return {
      x: arrow.x * rect.width - arrow.width / 2,
      y: arrow.y * rect.height - arrow.height / 2,
      w: arrow.width,
      h: arrow.height,
    };
  }

  function playerBounds(rect) {
    return {
      x: state.player.x * rect.width - (rect.width * state.player.width) / 2,
      y: state.player.y * rect.height - (rect.height * state.player.height) / 2,
      w: rect.width * state.player.width,
      h: rect.height * state.player.height,
    };
  }

  function updatePlayer(dt) {
    if (!state.move) {
      return;
    }
    const move = controls[state.move];
    if (!move) {
      return;
    }
    state.player.x += move.dx * state.player.speed * dt;
    state.player.y += move.dy * state.player.speed * dt;
    state.player.x = clamp(state.player.x, 0.08, 0.92);
    state.player.y = clamp(state.player.y, 0.58, 0.92);
  }

  function updateArrows(dt) {
    const rect = arenaRect();
    for (let i = state.arrows.length - 1; i >= 0; i -= 1) {
      const arrow = state.arrows[i];
      arrow.y -= (arrow.speed / 1000) * dt;
      if (arrow.y < -0.2) {
        arrow.el.remove();
        state.arrows.splice(i, 1);
        continue;
      }

      const arrowRect = arrowBounds(arrow, rect);
      let hit = false;

      for (let j = state.balloons.length - 1; j >= 0; j -= 1) {
        const balloon = state.balloons[j];
        const balloonRect = balloonBounds(balloon, rect);
        if (rectsIntersect(arrowRect, balloonRect)) {
          resolveBalloonHit(balloon);
          balloon.el.remove();
          state.balloons.splice(j, 1);
          hit = true;
          break;
        }
      }

      if (hit) {
        arrow.el.remove();
        state.arrows.splice(i, 1);
        continue;
      }

      renderArrow(arrow);
    }
  }

  function updateBalloons(dt) {
    const rect = arenaRect();
    for (let i = state.balloons.length - 1; i >= 0; i -= 1) {
      const balloon = state.balloons[i];
      balloon.y += (balloon.speed / 1000) * dt;
      balloon.x += balloon.drift * dt * 0.2;
      balloon.x = clamp(balloon.x, 0.06, 0.94);

      if (balloon.y > 1.08) {
        const lose = balloon.type === "score";
        balloon.el.remove();
        state.balloons.splice(i, 1);
        if (lose) {
          loseLife();
        }
        continue;
      }

      renderBalloon(balloon);
    }
  }

  function spawnLogic(dt) {
    state.spawnClock += dt;
    if (state.spawnClock >= state.spawnInterval) {
      const spawnCount = state.level >= 4 && Math.random() > 0.6 ? 2 : 1;
      for (let i = 0; i < spawnCount; i += 1) {
        spawnBalloon();
      }
      state.spawnClock = 0;
    }
  }

  function loop(timestamp) {
    if (!state.running || state.paused || state.over) {
      return;
    }
    if (state.lastFrame === 0) {
      state.lastFrame = timestamp;
    }
    const dt = Math.min(32, timestamp - state.lastFrame);
    state.lastFrame = timestamp;

    updatePlayer(dt);
    updateArrows(dt);
    updateBalloons(dt);
    spawnLogic(dt);
    renderPlayer();

    if (state.running && !state.paused && !state.over) {
      scheduleLoop();
    }
  }

  function handleKeyDown(event) {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
    };

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      fireArrow();
      return;
    }

    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      pauseGame();
      return;
    }

    const direction = keyMap[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    setMove(direction);
  }

  function handleKeyUp(event) {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
    };
    const direction = keyMap[event.key];
    if (direction) {
      stopMove(direction);
    }
  }

  function bindControls() {
    actionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-action");
        if (action === "start") {
          startGame();
        } else if (action === "shoot") {
          fireArrow();
        } else if (action === "pause") {
          pauseGame();
        } else if (action === "restart") {
          restartGame();
        }
      });
    });

    moveButtons.forEach((button) => {
      const direction = button.getAttribute("data-move");
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (direction) {
          setMove(direction);
        }
      });
      button.addEventListener("pointerup", () => {
        if (direction) {
          stopMove(direction);
        }
      });
      button.addEventListener("pointerleave", () => {
        if (direction) {
          stopMove(direction);
        }
      });
      button.addEventListener("pointercancel", () => {
        if (direction) {
          stopMove(direction);
        }
      });
    });

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", () => {
      renderPlayer();
      state.balloons.forEach(renderBalloon);
      state.arrows.forEach(renderArrow);
    });
  }

  function initialize() {
    bestEl.textContent = String(state.best);
    syncHud();
    resetGame({ keepReadyStatus: true, seedBalloons: true });
    bindControls();
    setStatus("Ready");
  }

  initialize();

  window.balloonGame = {
    startGame,
    pauseGame,
    restartGame,
    fireArrow,
  };
})();
