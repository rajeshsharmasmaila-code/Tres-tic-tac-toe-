/* TRES MAX — local play, AI, larger boards, series, sound & haptics */
(() => {
"use strict";

const $ = id => document.getElementById(id);
const modeButtons = Array.from(document.querySelectorAll("[data-play-mode]"));
const modePicker = document.querySelector(".mode-picker");
const onlineRoom = document.getElementById("game-room");
const modeBadge = $("mode-badge");
const lobby = $("lobby"), setup = $("local-setup"), localGame = $("local-game");
const sizeSelect = $("local-size"), winSelect = $("local-win"), seriesSelect = $("local-series");
const aiDifficultyWrap = $("ai-difficulty-wrap"), aiDifficulty = $("ai-difficulty");
const startBtn = $("start-local-btn"), boardEl = $("local-board"), statusEl = $("local-status");
const nextBtn = $("local-next-btn"), newBtn = $("local-new-btn"), exitBtn = $("local-exit-btn"), restartBtn = $("local-restart-btn");
const xScoreEl = $("local-x-score"), oScoreEl = $("local-o-score"), xLabel = $("local-x-label"), oLabel = $("local-o-label");
const soundToggle = $("sound-toggle"), hapticToggle = $("haptic-toggle");

let mode = "online";
let state = { n:3, k:3, series:1, target:1, difficulty:"medium", board:[], turn:"X", over:false, x:0, o:0, gameNo:1, matchOver:false };

const settings = {
  sound: localStorage.getItem("tres_sound") !== "off",
  haptic: localStorage.getItem("tres_haptic") !== "off"
};

function applySettingsUI(){
  [soundToggle,hapticToggle].forEach((b,i)=>{
    if(!b) return;
    const on = i===0 ? settings.sound : settings.haptic;
    b.textContent = on ? "ON" : "OFF";
    b.classList.toggle("is-on",on);
    b.setAttribute("aria-pressed",String(on));
  });
}
applySettingsUI();

function syncOnlineRoom(){ if(modePicker) modePicker.classList.toggle("hidden", mode==="online" && onlineRoom && !onlineRoom.classList.contains("hidden")); }
if(onlineRoom) new MutationObserver(syncOnlineRoom).observe(onlineRoom,{attributes:true,attributeFilter:["class"]});

function selectMode(next){
  mode=next;
  modeButtons.forEach(b=>b.classList.toggle("is-active",b.dataset.playMode===next));
  modeBadge.textContent=next==="online"?"ONLINE":next==="local"?"LOCAL":"AI";
  const local = next!=="online";
  setup.classList.toggle("hidden",!local);
  lobby.classList.toggle("hidden",local);
  localGame.classList.add("hidden");
  aiDifficultyWrap.classList.toggle("hidden",next!=="ai");
  $("local-title").textContent=next==="ai"?"AI Challenge":"Quick Match";
  startBtn.textContent=next==="ai"?"Start AI match":"Start local match";
  if(next==="online" && window.showLobby) window.showLobby();
  syncOnlineRoom();
}
modeButtons.forEach(b=>b.addEventListener("click",()=>selectMode(b.dataset.playMode)));

function sanitizeRules(){
  const n=Number(sizeSelect.value), requested=Number(winSelect.value);
  const k=Math.min(n,requested);
  winSelect.value=String(k);
  return {n,k};
}
sizeSelect.addEventListener("change",sanitizeRules);
winSelect.addEventListener("change",sanitizeRules);

syncOnlineRoom();

startBtn.addEventListener("click",()=>{
  const {n,k}=sanitizeRules();
  state={n,k,series:Number(seriesSelect.value),target:Math.ceil(Number(seriesSelect.value)/2),difficulty:aiDifficulty.value,
         board:Array(n*n).fill(""),turn:"X",over:false,x:0,o:0,gameNo:1,matchOver:false};
  xLabel.textContent=mode==="ai"?"YOU":"PLAYER X";
  oLabel.textContent=mode==="ai"?"AI":"PLAYER O";
  setup.classList.add("hidden"); localGame.classList.remove("hidden");
  updateScore(); render();
});

exitBtn.addEventListener("click",()=>{
  localGame.classList.add("hidden");
  setup.classList.remove("hidden");
});
newBtn.addEventListener("click",()=>{
  const {n,k}=sanitizeRules();
  state={...state,n,k,series:Number(seriesSelect.value),target:Math.ceil(Number(seriesSelect.value)/2),
    board:Array(n*n).fill(""),turn:"X",over:false,x:0,o:0,gameNo:1};
  updateScore(); render();
});
restartBtn.addEventListener("click",()=>startRound());

nextBtn.addEventListener("click",()=>{ if(state.matchOver){ const {n,k}=sanitizeRules(); state.x=0;state.o=0;state.gameNo=1;state.n=n;state.k=k;state.series=Number(seriesSelect.value);state.target=Math.ceil(state.series/2);state.matchOver=false;updateScore(); } startRound(); });

function startRound(){
  state.board=Array(state.n*state.n).fill("");
  state.turn="X"; state.over=false; state.gameNo++;
  nextBtn.classList.add("hidden"); render();
}

function updateScore(){
  xScoreEl.textContent=state.x; oScoreEl.textContent=state.o;
}

function render(){
  boardEl.style.setProperty("--n",state.n);
  boardEl.innerHTML="";
  state.board.forEach((s,i)=>{
    const b=document.createElement("button");
    b.type="button"; b.className="local-cell";
    b.dataset.i=i; b.setAttribute("aria-label",`Cell ${i+1}${s?`, ${s}`:""}`);
    b.innerHTML=s ? `<span class="local-mark ${s==="X"?"x":"o"}">${s}</span>` : "";
    b.disabled=state.over || state.board[i]!=="" || (mode==="ai" && state.turn==="O");
    b.addEventListener("click",()=>humanMove(i));
    boardEl.appendChild(b);
  });
  if(state.over) return;
  statusEl.textContent=mode==="ai"
    ? (state.turn==="X"?"Your move":"AI is thinking…")
    : `${state.turn==="X"?"Player X":"Player O"}'s move`;
  if(mode==="ai" && state.turn==="O") setTimeout(aiMove,220);
}

function humanMove(i){
  if(state.over || state.board[i] || (mode==="ai"&&state.turn==="O")) return;
  place(i,state.turn);
}

function place(i,s){
  if(state.board[i]||state.over) return;
  state.board[i]=s; buzz(); tone(s==="X"?520:390);
  const result=winner(state.board,state.n,state.k);
  if(result){
    finish(result); return;
  }
  state.turn=s==="X"?"O":"X"; render();
}

function finish(result){
  state.over=true;
  if(result.winner==="X") state.x++;
  else if(result.winner==="O") state.o++;
  updateScore();
  highlight(result.line);
  const seriesOver = state.x>=state.target || state.o>=state.target || state.series===1;
  state.matchOver = seriesOver;
  if(result.winner==="draw") { statusEl.textContent="Draw!"; tone(260); }
  else if(result.winner==="X") { statusEl.textContent=mode==="ai"?"You win! 🎉":"Player X wins! 🎉"; tone(760); }
  else { statusEl.textContent=mode==="ai"?"AI wins":"Player O wins"; tone(180); }
  if(seriesOver){
    setTimeout(()=>{
      if(state.series>1){
        const champ=state.x>state.o?(mode==="ai"?"You":"Player X"):(mode==="ai"?"AI":"Player O");
        statusEl.textContent=result.winner==="draw" ? "Match complete — draw!" : `${champ} wins the match! 🏆`;
      }
      nextBtn.textContent=state.series>1 && !seriesOver ? "Next game" : "Play again";
      nextBtn.classList.remove("hidden");
    },350);
  } else {
    nextBtn.textContent=`Next game (${state.x}-${state.o})`;
    nextBtn.classList.remove("hidden");
  }
}

function highlight(line){
  const cells=Array.from(boardEl.children);
  (line||[]).forEach(i=>cells[i]?.classList.add("local-win"));
  if(state.over) cells.forEach(c=>c.disabled=true);
}

function winner(board,n,k){
  const dirs=[[1,0],[0,1],[1,1],[1,-1]];
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    const idx=r*n+c, s=board[idx]; if(!s) continue;
    for(const [dr,dc] of dirs){
      const endR=r+(k-1)*dr,endC=c+(k-1)*dc;
      if(endR<0||endR>=n||endC<0||endC>=n) continue;
      const line=[], ok=Array.from({length:k},(_,j)=>{
        const rr=r+j*dr,cc=c+j*dc; line.push(rr*n+cc); return board[rr*n+cc]===s;
      }).every(Boolean);
      if(ok) return {winner:s,line};
    }
  }
  if(board.every(Boolean)) return {winner:"draw",line:[]};
  return null;
}

/* 3x3 exact minimax for Hard; scalable tactical AI for larger boards. */
function aiMove(){
  if(state.over||state.turn!=="O") return;
  let move;
  if(state.n===3 && state.k===3 && state.difficulty==="hard") move=bestMinimax(state.board.slice());
  else if(state.difficulty==="easy") move=randomMove(state.board);
  else move=tacticalMove();
  if(move!=null) place(move,"O");
}

function emptyCells(board){return board.map((v,i)=>v?null:i).filter(i=>i!==null);}
function randomMove(board){const e=emptyCells(board);return e[Math.floor(Math.random()*e.length)];}

function tacticalMove(){
  const e=emptyCells(state.board);
  for(const s of ["O","X"]){
    for(const i of e){
      state.board[i]=s;
      const w=winner(state.board,state.n,state.k);
      state.board[i]="";
      if(w?.winner===s) return i;
    }
  }
  const center=Math.floor(state.n/2)*state.n+Math.floor(state.n/2);
  if(!state.board[center]) return center;
  const corners=[0,state.n-1,state.n*(state.n-1),state.n*state.n-1].filter(i=>!state.board[i]);
  if(corners.length) return corners[Math.floor(Math.random()*corners.length)];
  return e[Math.floor(Math.random()*e.length)];
}

function bestMinimax(board){
  let best=-Infinity,bestMove=null;
  for(const i of emptyCells(board)){
    board[i]="O"; const score=minimax(board,false,0); board[i]="";
    if(score>best){best=score;bestMove=i;}
  }
  return bestMove;
}
function minimax(board,maximizing,depth){
  const r=winner(board,3,3);
  if(r) return r.winner==="O"?10-depth:r.winner==="X"?depth-10:0;
  const e=emptyCells(board); if(!e.length)return 0;
  if(maximizing){
    let v=-Infinity; for(const i of e){board[i]="O";v=Math.max(v,minimax(board,false,depth+1));board[i]="";} return v;
  } else {
    let v=Infinity; for(const i of e){board[i]="X";v=Math.min(v,minimax(board,true,depth+1));board[i]="";} return v;
  }
}

function tone(freq){
  if(!settings.sound) return;
  try{
    const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
    const ctx=tone.ctx||(tone.ctx=new C()); const o=ctx.createOscillator(),g=ctx.createGain();
    o.frequency.value=freq;o.type="sine";g.gain.setValueAtTime(.045,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.12);
  }catch{}
}
function buzz(){
  if(settings.haptic && navigator.vibrate) navigator.vibrate(12);
}
soundToggle?.addEventListener("click",()=>{
  settings.sound=!settings.sound;localStorage.setItem("tres_sound",settings.sound?"on":"off");applySettingsUI();
});
hapticToggle?.addEventListener("click",()=>{
  settings.haptic=!settings.haptic;localStorage.setItem("tres_haptic",settings.haptic?"on":"off");applySettingsUI();buzz();
});

window.addEventListener("resize",()=>{ if(!localGame.classList.contains("hidden")) boardEl.style.setProperty("--n",state.n); });
})();
