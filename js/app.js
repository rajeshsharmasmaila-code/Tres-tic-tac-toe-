"use strict";

/* ==========================================================
   ELEMENTS
   ========================================================== */
const el = (id) => document.getElementById(id);

const viewAuth = el("view-auth");
const appShell = el("app-shell");

const emailInput = el("email");
const passwordInput = el("password");
const authForm = el("auth-form");
const authSubmit = el("auth-submit");
const authMessage = el("auth-message");
const authTabs = Array.from(document.querySelectorAll(".auth-tab"));

const profileChip = el("profile-chip");
const profileAvatarChip = el("profile-avatar");

const lobby = el("lobby");
const createGameBtn = el("create-game-btn");
const gameCodeInput = el("game-code-input");
const joinGameBtn = el("join-game-btn");
const lobbyMessage = el("lobby-message");

const gameRoom = el("game-room");
const leaveGameBtn = el("leave-game-btn");
const displayGameCode = el("display-game-code");
const copyCodeBtn = el("copy-code-btn");
const cardPlayerX = el("card-player-x");
const cardPlayerO = el("card-player-o");
const playerXName = el("player-x-name");
const playerOName = el("player-o-name");
const gameStatus = el("game-status");
const gameBoard = el("game-board");
const gameCells = Array.from(document.querySelectorAll(".cell"));
const winLineSvg = el("win-line-svg");
const winLine = el("win-line");
const gameActions = el("game-actions");
const rematchBtn = el("rematch-btn");
const newTableBtn = el("new-table-btn");

const historyList = el("history-list");
const leaderboardList = el("leaderboard-list");

const statGames = el("stat-games");
const statWins = el("stat-wins");
const statLosses = el("stat-losses");
const statDraws = el("stat-draws");
const statWinrate = el("stat-winrate");
const usernameInput = el("username-input");
const avatarInput = el("avatar-input");
const saveProfileBtn = el("save-profile-btn");
const profileMessage = el("profile-message");
const logoutBtn = el("logout-btn");

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const views = {
    play: el("view-play"),
    history: el("view-history"),
    leaderboard: el("view-leaderboard"),
    profile: el("view-profile")
};

const toastEl = el("toast");
const confettiLayer = el("confetti-layer");

/* ==========================================================
   STATE
   ========================================================== */
let currentUser = null;
let profile = null;
let currentGame = null;
let currentGameId = null;
let authMode = "login";
let activeView = "play";
let moveInProgress = false;
let roomPollTimer = null;
let realtimeChannel = null;
let toastTimer = null;
let renderedSnapshot = null;
let profilesCache = {};

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

/* ==========================================================
   INIT
   ========================================================== */
function init() {
    wireAuthUI();
    wireLobbyUI();
    wireRoomUI();
    wireTabUI();
    wireProfileUI();

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            enterApp(session.user);
        } else {
            exitApp();
        }
    });

    supabaseClient.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) {
            enterApp(data.session.user);
        }
    });
}

async function enterApp(user) {
    currentUser = user;
    profile = await ensureProfile(user);
    profileAvatarChip.textContent = profile.avatar || "🙂";

    viewAuth.classList.add("hidden");
    appShell.classList.remove("hidden");

    setActiveView("play");
    await resumeOrShowLobby();
}

function exitApp() {
    currentUser = null;
    profile = null;
    leaveRoomLocal();
    appShell.classList.add("hidden");
    viewAuth.classList.remove("hidden");
    authForm.reset();
    authMessage.textContent = "";
}

async function ensureProfile(user) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (data) return data;
        if (error) console.error("Profile fetch error:", error);

        // The DB trigger creates this row on signup; on the very first
        // login it may not have landed yet, so give it a beat and retry.
        await new Promise((r) => setTimeout(r, 400));
    }

    // Last resort fallback so the app never gets stuck without a profile.
    const fallback = { id: user.id, username: "Player", avatar: "🙂" };
    await supabaseClient.from("profiles").upsert(fallback);
    return fallback;
}

/* ==========================================================
   AUTH
   ========================================================== */
function wireAuthUI() {
    authTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            authMode = tab.dataset.mode;
            authTabs.forEach((t) => t.classList.toggle("is-active", t === tab));
            authSubmit.textContent = authMode === "login" ? "Log in" : "Create account";
            authMessage.textContent = "";
            authMessage.classList.remove("is-error");
        });
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        authSubmit.disabled = true;
        authMessage.textContent = "";
        authMessage.classList.remove("is-error");

        try {
            if (authMode === "login") {
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { data, error } = await supabaseClient.auth.signUp({ email, password });
                if (error) throw error;
                if (!data.session) {
                    authMessage.textContent = "Account created. Check your email to confirm, then log in.";
                    authSubmit.disabled = false;
                    return;
                }
            }
        } catch (error) {
            console.error("Auth error:", error);
            authMessage.textContent = error.message || "Something went wrong.";
            authMessage.classList.add("is-error");
        } finally {
            authSubmit.disabled = false;
        }
    });
}

/* ==========================================================
   TAB NAVIGATION
   ========================================================== */
function wireTabUI() {
    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => setActiveView(btn.dataset.view));
    });
    profileChip.addEventListener("click", () => setActiveView("profile"));
}

function setActiveView(name) {
    activeView = name;
    Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
    tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === name));

    if (name === "history") loadHistory();
    if (name === "leaderboard") loadLeaderboard();
    if (name === "profile") loadProfileView();
}

/* ==========================================================
   LOBBY
   ========================================================== */
function wireLobbyUI() {
    createGameBtn.addEventListener("click", createGame);

    joinGameBtn.addEventListener("click", () => joinGame(gameCodeInput.value.trim()));
    gameCodeInput.addEventListener("input", () => {
        gameCodeInput.value = gameCodeInput.value.replace(/\D/g, "").slice(0, 6);
    });
    gameCodeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") joinGame(gameCodeInput.value.trim());
    });
}

function setLobbyMessage(text, isError) {
    lobbyMessage.textContent = text || "";
    lobbyMessage.classList.toggle("is-error", Boolean(isError));
}

async function resumeOrShowLobby() {
    const { data, error } = await supabaseClient
        .from("games")
        .select("*")
        .in("status", ["waiting", "playing"])
        .or(`player_x.eq.${currentUser.id},player_o.eq.${currentUser.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!error && data) {
        await enterRoom(data);
    } else {
        showLobby();
    }
}

function showLobby() {
    leaveRoomLocal();
    lobby.classList.remove("hidden");
    gameRoom.classList.add("hidden");
    setLobbyMessage("");
    gameCodeInput.value = "";
}

async function createGame() {
    createGameBtn.disabled = true;
    setLobbyMessage("");
    try {
        const { data, error } = await supabaseClient
            .from("games")
            .insert({ player_x: currentUser.id })
            .select()
            .single();
        if (error) throw error;
        await enterRoom(data);
    } catch (error) {
        console.error("Create game error:", error);
        setLobbyMessage("Could not create a table: " + error.message, true);
    } finally {
        createGameBtn.disabled = false;
    }
}

async function joinGame(code) {
    if (!code || code.length !== 6) {
        setLobbyMessage("Enter the full 6-digit code.", true);
        return;
    }
    joinGameBtn.disabled = true;
    setLobbyMessage("");

    try {
        const { data: game, error: findError } = await supabaseClient
            .from("games")
            .select("*")
            .eq("game_code", code)
            .maybeSingle();
        if (findError) throw findError;

        if (!game) {
            setLobbyMessage("No table found with that code.", true);
            return;
        }

        if (game.player_x === currentUser.id || game.player_o === currentUser.id) {
            await enterRoom(game);
            return;
        }

        if (game.status !== "waiting" || game.player_o) {
            setLobbyMessage("That table is already full.", true);
            return;
        }

        const { data: joined, error: joinError } = await supabaseClient
            .from("games")
            .update({ player_o: currentUser.id, status: "playing" })
            .eq("id", game.id)
            .eq("status", "waiting")
            .is("player_o", null)
            .select()
            .maybeSingle();

        if (joinError) throw joinError;
        if (!joined) {
            setLobbyMessage("Someone else just took that seat.", true);
            return;
        }

        await enterRoom(joined);
    } catch (error) {
        console.error("Join game error:", error);
        setLobbyMessage("Could not join: " + error.message, true);
    } finally {
        joinGameBtn.disabled = false;
    }
}

/* ==========================================================
   ROOM UI WIRING
   ========================================================== */
function wireRoomUI() {
    leaveGameBtn.addEventListener("click", showLobby);
    copyCodeBtn.addEventListener("click", copyGameCode);

    gameCells.forEach((cell) => {
        cell.addEventListener("click", () => handleCellClick(Number(cell.dataset.index)));
    });

    rematchBtn.addEventListener("click", requestRematch);
    newTableBtn.addEventListener("click", async () => {
        showLobby();
        await createGame();
    });
}

function copyGameCode() {
    if (!currentGame) return;
    const code = currentGame.game_code;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => showToast("Code copied — send it to your opponent."));
    } else {
        showToast("Table code: " + code);
    }
}

/* ==========================================================
   ENTER / LEAVE ROOM
   ========================================================== */
async function enterRoom(game) {
    lobby.classList.add("hidden");
    gameRoom.classList.remove("hidden");
    resetBoardDom();
    renderedSnapshot = null;

    currentGameId = game.id;
    currentGame = game;
    subscribeRealtime(game.id);
    startRoomPoll();
    renderRoom(game);
}

function leaveRoomLocal() {
    stopRoomPoll();
    unsubscribeRealtime();
    currentGameId = null;
    currentGame = null;
    renderedSnapshot = null;
}

/* ==========================================================
   POLLING (single continuous loop — the guaranteed backstop)
   ========================================================== */
function startRoomPoll() {
    if (roomPollTimer) return;
    roomPollTimer = setInterval(async () => {
        if (!currentGameId || moveInProgress) return;
        const { data, error } = await supabaseClient
            .from("games")
            .select("*")
            .eq("id", currentGameId)
            .maybeSingle();
        if (!error && data) reconcileGame(data);
    }, 1200);
}

function stopRoomPoll() {
    if (roomPollTimer) {
        clearInterval(roomPollTimer);
        roomPollTimer = null;
    }
}

/* ==========================================================
   REALTIME (fast path — poll is the backstop if this hiccups)
   ========================================================== */
function subscribeRealtime(gameId) {
    unsubscribeRealtime();
    realtimeChannel = supabaseClient
        .channel(`game-${gameId}`)
        .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
            (payload) => {
                if (!moveInProgress) reconcileGame(payload.new);
            }
        )
        .subscribe();
}

function unsubscribeRealtime() {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

/* ==========================================================
   RECONCILE — single entry point for any fresh game row,
   whether it came from a move, poll tick, or realtime event.
   ========================================================== */
function reconcileGame(game) {
    if (!game || game.id !== currentGameId) return;

    // Both players agreed to a rematch: the DB trigger has already
    // created the new game atomically. Everyone just follows the pointer.
    if (game.rematch_game_id && game.status === "finished") {
        currentGameId = game.rematch_game_id;
        subscribeRealtime(currentGameId);
        resetBoardDom();
        renderedSnapshot = null;
        supabaseClient
            .from("games")
            .select("*")
            .eq("id", currentGameId)
            .maybeSingle()
            .then(({ data }) => {
                if (data) {
                    currentGame = data;
                    renderRoom(data);
                }
            });
        return;
    }

    currentGame = game;
    renderRoom(game);
}

/* ==========================================================
   MOVES
   ========================================================== */
function getMySymbol(game) {
    if (!game || !currentUser) return null;
    if (game.player_x === currentUser.id) return "X";
    if (game.player_o === currentUser.id) return "O";
    return null;
}

function checkResult(board) {
    for (const line of WIN_LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line };
        }
    }
    if (board.every((c) => c !== "")) return { winner: "draw", line: null };
    return { winner: null, line: null };
}

async function handleCellClick(index) {
    if (!currentGame || moveInProgress) return;
    if (currentGame.status !== "playing") return;

    const mySymbol = getMySymbol(currentGame);
    if (!mySymbol || currentGame.current_turn !== mySymbol) return;
    if (currentGame.board[index] !== "") return;

    moveInProgress = true;

    const newBoard = currentGame.board.slice();
    newBoard[index] = mySymbol;
    const result = checkResult(newBoard);

    const patch = {
        board: newBoard,
        current_turn: mySymbol === "X" ? "O" : "X"
    };
    if (result.winner) {
        patch.status = "finished";
        patch.winner = result.winner;
    }

    const { data, error } = await supabaseClient
        .from("games")
        .update(patch)
        .eq("id", currentGame.id)
        .eq("current_turn", mySymbol)
        .eq("status", "playing")
        .select()
        .maybeSingle();

    moveInProgress = false;

    if (error || !data) {
        console.error("Move error:", error);
        showToast("That move didn't sync — refreshing the board.");
        const { data: fresh } = await supabaseClient
            .from("games").select("*").eq("id", currentGame.id).maybeSingle();
        if (fresh) reconcileGame(fresh);
        return;
    }

    reconcileGame(data);
}

/* ==========================================================
   REMATCH
   ========================================================== */
async function requestRematch() {
    if (!currentGame || currentGame.status !== "finished") return;
    const mySymbol = getMySymbol(currentGame);
    if (!mySymbol) return;

    const column = mySymbol === "X" ? "rematch_x" : "rematch_o";
    rematchBtn.disabled = true;

    const { data, error } = await supabaseClient
        .from("games")
        .update({ [column]: true })
        .eq("id", currentGame.id)
        .select()
        .maybeSingle();

    if (error) {
        console.error("Rematch request error:", error);
        showToast("Could not request a rematch.");
        rematchBtn.disabled = false;
        return;
    }

    // If the other player had already agreed, `data` already carries
    // rematch_game_id — reconcile jumps straight to the new table.
    reconcileGame(data);
}

/* ==========================================================
   RENDER — ROOM
   ========================================================== */
function resetBoardDom() {
    gameCells.forEach((cell) => {
        cell.innerHTML = "";
        cell.dataset.symbol = "";
        cell.disabled = false;
        cell.classList.remove("win-cell", "just-placed");
    });
    winLine.classList.remove("is-drawn");
    winLine.setAttribute("x1", 0);
    winLine.setAttribute("y1", 0);
    winLine.setAttribute("x2", 0);
    winLine.setAttribute("y2", 0);
}

function markSvg(symbol) {
    if (symbol === "X") {
        return `<svg viewBox="0 0 100 100" class="cell-mark-x">
            <path d="M22 22 L78 78"></path>
            <path d="M78 22 L22 78"></path>
        </svg>`;
    }
    if (symbol === "O") {
        return `<svg viewBox="0 0 100 100" class="cell-mark-o">
            <circle cx="50" cy="50" r="34"></circle>
        </svg>`;
    }
    return "";
}

async function renderRoom(game) {
    const snapshot = [game.id, game.status, game.board.join(""), game.winner, game.current_turn,
        game.rematch_x, game.rematch_o, game.player_o].join("|");
    const isNewSnapshot = snapshot !== renderedSnapshot;
    renderedSnapshot = snapshot;

    displayGameCode.textContent = game.game_code || "------";

    playerXName.textContent = await nameFor(game.player_x);
    playerOName.textContent = game.player_o ? await nameFor(game.player_o) : "Waiting…";

    cardPlayerX.classList.toggle("is-turn", game.status === "playing" && game.current_turn === "X");
    cardPlayerO.classList.toggle("is-turn", game.status === "playing" && game.current_turn === "O");

    renderBoard(game);

    if (game.status === "waiting") {
        gameBoard.classList.add("hidden");
        gameActions.classList.add("hidden");
        gameStatus.textContent = "Waiting for player two to join…";
        return;
    }

    gameBoard.classList.remove("hidden");

    if (game.status === "playing") {
        gameActions.classList.add("hidden");
        const mySymbol = getMySymbol(game);
        if (mySymbol && game.current_turn === mySymbol) {
            gameStatus.textContent = "Your move";
        } else {
            gameStatus.textContent = `Player ${game.current_turn}'s move…`;
        }
        return;
    }

    // finished
    gameActions.classList.remove("hidden");

    if (game.winner === "draw") {
        gameStatus.textContent = "It's a draw!";
    } else {
        const mySymbol = getMySymbol(game);
        gameStatus.textContent = game.winner === mySymbol ? "You win! 🎉" : `Player ${game.winner} wins`;
    }

    const result = checkResult(game.board);
    if (result.line) {
        result.line.forEach((i) => gameCells[i].classList.add("win-cell"));
        drawWinLine(result.line);
        if (isNewSnapshot && getMySymbol(game) === game.winner) spawnConfetti();
    }

    const mySymbol = getMySymbol(game);
    const myFlag = mySymbol === "X" ? game.rematch_x : game.rematch_o;
    const otherFlag = mySymbol === "X" ? game.rematch_o : game.rematch_x;
    rematchBtn.textContent = myFlag ? (otherFlag ? "Starting rematch…" : "Rematch requested — waiting…") : "Request rematch";
    rematchBtn.disabled = Boolean(myFlag);
}

function renderBoard(game) {
    const board = game.board;
    gameCells.forEach((cell, i) => {
        const symbol = board[i] || "";
        const already = cell.dataset.symbol || "";
        if (symbol !== already) {
            cell.innerHTML = markSvg(symbol);
            cell.dataset.symbol = symbol;
            if (symbol) {
                cell.classList.add("just-placed");
                setTimeout(() => cell.classList.remove("just-placed"), 250);
            }
        }
        const mySymbol = getMySymbol(game);
        const canPlay = game.status === "playing" && !symbol && mySymbol && game.current_turn === mySymbol;
        cell.disabled = !canPlay;
    });
}

function drawWinLine(line) {
    const [a, , c] = line;
    const cellCenter = (i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        return { x: col * 100 + 50, y: row * 100 + 50 };
    };
    const p1 = cellCenter(a);
    const p2 = cellCenter(c);
    winLine.setAttribute("x1", p1.x);
    winLine.setAttribute("y1", p1.y);
    winLine.setAttribute("x2", p2.x);
    winLine.setAttribute("y2", p2.y);
    // restart the draw-in animation
    winLine.classList.remove("is-drawn");
    // eslint-disable-next-line no-unused-expressions
    winLine.getBoundingClientRect();
    winLine.classList.add("is-drawn");
}

/* ==========================================================
   PROFILE NAME / AVATAR CACHE
   ========================================================== */
async function nameFor(userId) {
    if (!userId) return "Waiting…";
    if (profilesCache[userId]) return profilesCache[userId].username || "Player";
    const { data } = await supabaseClient.from("profiles").select("username, avatar").eq("id", userId).maybeSingle();
    profilesCache[userId] = data || { username: "Player", avatar: "🙂" };
    return profilesCache[userId].username || "Player";
}

/* ==========================================================
   HISTORY
   ========================================================== */
async function loadHistory() {
    historyList.innerHTML = `<p class="empty-note">Loading…</p>`;
    const { data, error } = await supabaseClient
        .from("games")
        .select("*")
        .eq("status", "finished")
        .or(`player_x.eq.${currentUser.id},player_o.eq.${currentUser.id}`)
        .order("created_at", { ascending: false })
        .limit(25);

    if (error) {
        historyList.innerHTML = `<p class="empty-note">Could not load history.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        historyList.innerHTML = `<p class="empty-note">No finished games yet — go play one!</p>`;
        return;
    }

    const rows = await Promise.all(data.map(async (game) => {
        const mySymbol = game.player_x === currentUser.id ? "X" : "O";
        const opponentId = mySymbol === "X" ? game.player_o : game.player_x;
        const opponentName = opponentId ? await nameFor(opponentId) : "—";

        let resultClass = "result-draw";
        let resultLabel = "D";
        if (game.winner === mySymbol) { resultClass = "result-win"; resultLabel = "W"; }
        else if (game.winner && game.winner !== "draw") { resultClass = "result-loss"; resultLabel = "L"; }

        const when = new Date(game.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

        return `<div class="list-row">
            <div class="list-row-result ${resultClass}">${resultLabel}</div>
            <div class="list-row-body">
                <div class="list-row-title">vs ${escapeHtml(opponentName)}</div>
                <div class="list-row-sub">You played ${mySymbol} · ${when}</div>
            </div>
        </div>`;
    }));

    historyList.innerHTML = rows.join("");
}

/* ==========================================================
   LEADERBOARD
   ========================================================== */
async function loadLeaderboard() {
    leaderboardList.innerHTML = `<p class="empty-note">Loading standings…</p>`;
    const { data, error } = await supabaseClient.rpc("get_leaderboard", { p_limit: 20 });

    if (error) {
        leaderboardList.innerHTML = `<p class="empty-note">Could not load the leaderboard.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        leaderboardList.innerHTML = `<p class="empty-note">No games finished yet — be the first!</p>`;
        return;
    }

    leaderboardList.innerHTML = data.map((row, i) => `
        <div class="list-row">
            <div class="list-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
            <div class="list-avatar">${escapeHtml(row.avatar || "🙂")}</div>
            <div class="list-row-body">
                <div class="list-row-title">${escapeHtml(row.username || "Player")}${row.user_id === currentUser.id ? " (you)" : ""}</div>
                <div class="list-row-sub">${row.games_played} played</div>
            </div>
            <div class="list-row-stats"><strong>${row.wins}W</strong>${row.win_rate}%</div>
        </div>
    `).join("");
}

/* ==========================================================
   PROFILE VIEW
   ========================================================== */
function wireProfileUI() {
    saveProfileBtn.addEventListener("click", saveProfile);
    logoutBtn.addEventListener("click", () => supabaseClient.auth.signOut());
}

async function loadProfileView() {
    usernameInput.value = profile.username || "";
    avatarInput.value = profile.avatar || "🙂";
    profileMessage.textContent = "";

    const { data, error } = await supabaseClient.rpc("get_player_stats", { p_user_id: currentUser.id });
    if (!error && data && data.length) {
        const s = data[0];
        statGames.textContent = s.games_played;
        statWins.textContent = s.wins;
        statLosses.textContent = s.losses;
        statDraws.textContent = s.draws;
        statWinrate.textContent = `${s.win_rate}%`;
    }
}

async function saveProfile() {
    const username = usernameInput.value.trim().slice(0, 20) || "Player";
    const avatar = avatarInput.value.trim().slice(0, 4) || "🙂";

    saveProfileBtn.disabled = true;
    const { data, error } = await supabaseClient
        .from("profiles")
        .update({ username, avatar })
        .eq("id", currentUser.id)
        .select()
        .maybeSingle();
    saveProfileBtn.disabled = false;

    if (error) {
        profileMessage.textContent = "Could not save: " + error.message;
        profileMessage.classList.add("is-error");
        return;
    }

    profile = data;
    profilesCache[currentUser.id] = data;
    profileAvatarChip.textContent = avatar;
    profileMessage.classList.remove("is-error");
    profileMessage.textContent = "Saved!";
    setTimeout(() => { profileMessage.textContent = ""; }, 1800);
}

/* ==========================================================
   TOAST + CONFETTI
   ========================================================== */
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

function spawnConfetti() {
    const glyphs = ["X", "O", "★", "●"];
    const colors = ["#ff6b5b", "#46e0ac", "#ffc857"];
    const count = 26;
    for (let i = 0; i < count; i++) {
        const piece = document.createElement("span");
        piece.className = "confetti-piece";
        piece.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        piece.style.left = `${Math.random() * 100}vw`;
        piece.style.color = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty("--spin", `${(Math.random() * 720 - 360).toFixed(0)}deg`);
        const duration = 1.8 + Math.random() * 1.4;
        piece.style.animationDuration = `${duration}s`;
        piece.style.animationDelay = `${Math.random() * 0.3}s`;
        confettiLayer.appendChild(piece);
        setTimeout(() => piece.remove(), (duration + 0.3) * 1000);
    }
}

/* ==========================================================
   UTIL
   ========================================================== */
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[ch]));
}

/* ==========================================================
   GO
   ========================================================== */
init();
