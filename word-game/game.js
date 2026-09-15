(function(){
'use strict';

document.getElementById('wcount').textContent = WORDS.length;

/* ---------- 글자 크기 조절 (80% ~ 180%, 10% 단위) ---------- */
var FS_KEY = 'rhl_fs', fontScale = 100;
try {
  var savedFs = localStorage.getItem(FS_KEY);
  if (savedFs) {
    var parsed = parseInt(savedFs, 10);
    if (!isNaN(parsed) && parsed >= 80 && parsed <= 180) fontScale = parsed;
  }
} catch(e) {}

function applyFontSize(fs) {
  fontScale = fs;
  document.documentElement.style.fontSize = fontScale + '%';
  var resetBtn = document.getElementById('fontReset');
  var decBtn = document.getElementById('fontDec');
  var incBtn = document.getElementById('fontInc');
  if (resetBtn) resetBtn.textContent = fontScale + '%';
  if (decBtn) decBtn.disabled = (fontScale <= 80);
  if (incBtn) incBtn.disabled = (fontScale >= 180);
  try { localStorage.setItem(FS_KEY, String(fontScale)); } catch(e) {}
}

var fontDecEl = document.getElementById('fontDec');
var fontIncEl = document.getElementById('fontInc');
var fontResetEl = document.getElementById('fontReset');
if (fontDecEl) fontDecEl.onclick = function() { applyFontSize(Math.max(80, fontScale - 10)); };
if (fontIncEl) fontIncEl.onclick = function() { applyFontSize(Math.min(180, fontScale + 10)); };
if (fontResetEl) fontResetEl.onclick = function() { applyFontSize(100); };
applyFontSize(fontScale);

var setupEl = document.getElementById('setup');
var gameEl = document.getElementById('game');
var doneEl = document.getElementById('done');
var boardEl = document.getElementById('board');
var progressEl = document.getElementById('progress');
var statsEl = document.getElementById('stats');

var st = { n: 0, cells: [], flippedIdx: [], matched: 0, moves: 0, lock: false, startTime: null, timer: null };

function bestKey(n){ return 'rhl_wordgame_best_' + n; }
function loadBest(n){
  try{
    var raw = localStorage.getItem(bestKey(n));
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return null;
}
function saveBest(n, moves, seconds){
  try{
    var cur = loadBest(n);
    if(!cur || moves < cur.moves || (moves === cur.moves && seconds < cur.seconds)){
      localStorage.setItem(bestKey(n), JSON.stringify({moves:moves, seconds:seconds}));
      return true;
    }
  }catch(e){}
  return false;
}
function fmtBest(n){
  var b = loadBest(n);
  if(!b) return '';
  return ' 최고 ' + b.moves + '번 · ' + b.seconds + '초';
}
function refreshBestLabels(){
  [6,8,12].forEach(function(n){
    var el = document.getElementById('best-' + n);
    if(el) el.textContent = fmtBest(n);
  });
}

function shuffle(arr){
  for(var i = arr.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function pickWords(n){
  var pool = WORDS.slice();
  shuffle(pool);
  return pool.slice(0, n);
}

function buildCells(words){
  var cells = [];
  words.forEach(function(w, i){
    cells.push({ key: i, type: 'en', text: w.en, pos: w.pos, ko: w.ko, ipa: w.ipa });
    cells.push({ key: i, type: 'ko', text: w.ko, pos: w.pos, ko: w.ko, ipa: w.ipa });
  });
  return shuffle(cells);
}

function fmtTime(sec){
  var m = Math.floor(sec / 60), s = sec % 60;
  return (m > 0 ? m + '분 ' : '') + s + '초';
}

function tick(){
  if(!st.startTime) return;
  var sec = Math.floor((Date.now() - st.startTime) / 1000);
  statsEl.textContent = '시도 ' + st.moves + '번 · ' + fmtTime(sec);
}

function renderBoard(){
  boardEl.innerHTML = '';
  st.cells.forEach(function(c, idx){
    var cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('data-idx', idx);
    var inner = document.createElement('div');
    inner.className = 'cardface';
    var back = document.createElement('div');
    back.className = 'side back';
    back.textContent = '?';
    var front = document.createElement('div');
    front.className = 'side front';
    if(c.type === 'en'){
      front.innerHTML = '<span class="pos">' + c.pos + '</span><span class="en">' + escapeHtml(c.text) + '</span>'
        + (c.ipa ? '<span class="ipa">/' + escapeHtml(c.ipa) + '/</span>' : '');
    } else {
      front.innerHTML = '<span class="en" style="font-family:inherit;font-weight:400">' + escapeHtml(c.text) + '</span>';
    }
    inner.appendChild(back);
    inner.appendChild(front);
    cell.appendChild(inner);
    cell.addEventListener('click', function(){ onCellClick(idx); });
    boardEl.appendChild(cell);
  });
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function cellEl(idx){ return boardEl.querySelector('[data-idx="' + idx + '"]'); }

function onCellClick(idx){
  if(st.lock) return;
  var cell = st.cells[idx];
  if(cell.done) return;
  if(st.flippedIdx.indexOf(idx) !== -1) return;
  if(st.flippedIdx.length >= 2) return;
  if(!st.startTime){ st.startTime = Date.now(); st.timer = setInterval(tick, 500); }

  cellEl(idx).classList.add('flip');
  st.flippedIdx.push(idx);

  if(st.flippedIdx.length === 2){
    st.moves++;
    st.lock = true;
    var a = st.cells[st.flippedIdx[0]], b = st.cells[st.flippedIdx[1]];
    var isMatch = a.key === b.key && a.type !== b.type;
    setTimeout(function(){
      if(isMatch){
        st.flippedIdx.forEach(function(i){
          st.cells[i].done = true;
          cellEl(i).classList.add('matched');
        });
        st.matched++;
        updateProgress();
        if(st.matched === st.n) finishRound();
      } else {
        st.flippedIdx.forEach(function(i){
          var el = cellEl(i);
          el.classList.add('wrong');
          setTimeout(function(){ el.classList.remove('flip','wrong'); }, 260);
        });
      }
      st.flippedIdx = [];
      st.lock = false;
      tick();
    }, isMatch ? 350 : 700);
  }
}

function updateProgress(){
  progressEl.textContent = '짝 맞춘 개수 ' + st.matched + ' / ' + st.n;
}

function finishRound(){
  clearInterval(st.timer);
  var seconds = Math.floor((Date.now() - st.startTime) / 1000);
  var isBest = saveBest(st.n, st.moves, seconds);
  gameEl.classList.add('hidden');
  doneEl.classList.remove('hidden');
  document.getElementById('doneTitle').textContent = st.n + '쌍 완료!';
  document.getElementById('doneStats').textContent = '시도 ' + st.moves + '번 · ' + fmtTime(seconds);
  document.getElementById('doneBest').textContent = isBest ? '🎉 새 최고 기록입니다.' : ('최고 기록: ' + (loadBest(st.n).moves) + '번 · ' + loadBest(st.n).seconds + '초');
  refreshBestLabels();
}

function startRound(n){
  st.n = n; st.matched = 0; st.moves = 0; st.flippedIdx = []; st.lock = false;
  st.startTime = null; clearInterval(st.timer);
  st.cells = buildCells(pickWords(n));
  setupEl.classList.add('hidden');
  doneEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  updateProgress();
  statsEl.textContent = '시도 0번 · 0초';
  renderBoard();
}

Array.prototype.forEach.call(document.querySelectorAll('.pick'), function(btn){
  btn.addEventListener('click', function(){ startRound(+btn.getAttribute('data-n')); });
});
document.getElementById('reshuffle').addEventListener('click', function(){
  clearInterval(st.timer);
  gameEl.classList.add('hidden');
  setupEl.classList.remove('hidden');
});
document.getElementById('again').addEventListener('click', function(){ startRound(st.n); });
document.getElementById('toSetup').addEventListener('click', function(){
  doneEl.classList.add('hidden');
  setupEl.classList.remove('hidden');
});

refreshBestLabels();
})();
