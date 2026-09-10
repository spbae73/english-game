(function(){
'use strict';

/* ---------- 읽기 페이지 진행 상황(읽은 대목까지만 출제) ---------- */
var seen=0;
try{
  var mainRaw=localStorage.getItem('rhl');
  if(mainRaw){var mo=JSON.parse(mainRaw); seen=mo.seen||0}
}catch(e){}

/* ---------- 이 게임 자체의 저장 상태(진행 위치·난이도) ---------- */
var st={idx:0, done:[], diff:null};
try{
  var raw=localStorage.getItem('rhl_sentgame');
  if(raw){var o=JSON.parse(raw); st.idx=o.idx||0; st.done=o.done||[]; st.diff=o.diff||null}
}catch(e){}
function save(){try{localStorage.setItem('rhl_sentgame', JSON.stringify({idx:st.idx, done:st.done, diff:st.diff}))}catch(e){}}

var DIFF_PCT={base:0, d30:0.3, d50:0.5};

/* ---------- red-headed-league.html과 동일한 뼈대 정렬 로직 ---------- */
function cw(w){return w.replace(/[^A-Za-z'-]/g,'').toLowerCase()}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}

function skeletonHits(t,sk){
  var tTok=t.split(/(\s+)/),tIdx=[],tWords=[];
  for(var i=0;i<tTok.length;i++){var w=cw(tTok[i]);if(w){tIdx.push(i);tWords.push(w)}}
  var skWords=sk.split(/\s+/).map(cw).filter(Boolean);
  var n=tWords.length,m=skWords.length,dp=[];
  for(var a=0;a<=n;a++){dp.push(new Array(m+1).fill(0))}
  for(var a2=1;a2<=n;a2++)for(var b=1;b<=m;b++){
    dp[a2][b]=(tWords[a2-1]===skWords[b-1])?dp[a2-1][b-1]+1:Math.max(dp[a2-1][b],dp[a2][b-1]);
  }
  var hits={},x=n,y=m;
  while(x>0&&y>0){
    if(tWords[x-1]===skWords[y-1]){hits[tIdx[x-1]]=true;x--;y--}
    else if(dp[x-1][y]>=dp[x][y-1])x--; else y--;
  }
  return {tok:tTok,hits:hits};
}

/* 토큰을 [앞쪽 문장부호][핵심 글자][뒤쪽 문장부호]로 나눔. 핵심 글자만 빈칸으로 만든다 */
function splitTok(raw){
  var m=raw.match(/^([^A-Za-z]*)([A-Za-z'-]*)([^A-Za-z]*)$/);
  return {pre:m[1]||'', core:m[2]||'', post:m[3]||''};
}

/* ---------- 문제 풀 만들기: 읽은 대목(pi<=seen)만, 빈칸 2개 이상만 ---------- */
var POOL=[];
SENT_DATA.forEach(function(s){
  if(s.pi>seen) return;
  var r=skeletonHits(s.t, s.sk);
  var blanks=0;
  for(var i=0;i<r.tok.length;i++){
    var core=cw(r.tok[i]);
    if(core && !r.hits[i]) blanks++;
  }
  if(blanks>=2){ s._r=r; s._blankCount=blanks; POOL.push(s) }
});
if(st.idx>=POOL.length) st.idx=0;

/* ---------- 화면 요소 ---------- */
var setupEl=document.getElementById('setup');
var emptyEl=document.getElementById('empty');
var gameEl=document.getElementById('game');

if(!POOL.length){
  emptyEl.classList.remove('hidden');
}else if(!st.diff){
  showSetup();
}else{
  startGame();
}

function showSetup(){
  setupEl.classList.remove('hidden');
  gameEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  setupEl.querySelectorAll('.pick').forEach(function(btn){
    btn.onclick=function(){
      st.diff=btn.getAttribute('data-diff');
      save();
      startGame();
    };
  });
}

function startGame(){
  setupEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  loadSentence();
}

/* ---------- 게임 로직 ---------- */
var curParts=null, curBlanks=null, curBank=null, selBlank=null, completed=false;

function buildParts(s){
  var r=s._r, parts=[], blanks=[];
  for(var i=0;i<r.tok.length;i++){
    var raw=r.tok[i];
    if(/^\s+$/.test(raw)){parts.push({type:'sp', text:raw}); continue}
    var core=cw(raw);
    if(!core || r.hits[i]){
      parts.push({type:'text', text:raw});
    }else{
      var sp=splitTok(raw);
      var b={pre:sp.pre, core:sp.core, post:sp.post, filled:false, bi:blanks.length};
      blanks.push(b);
      parts.push({type:'blank', b:b});
    }
  }
  return {parts:parts, blanks:blanks};
}

function shuffle(arr){
  var a=arr.slice();
  for(var i=a.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var tmp=a[i]; a[i]=a[j]; a[j]=tmp;
  }
  return a;
}

/* 난이도에 맞춰 오답(다른 단어) 뽑기: 사전(word-game의 WORDS)에서 이 문장의 정답과
   겹치지 않는 단어를 무작위로 골라온다. 최소 2개, 최대 8개로 제한 */
function pickDecoys(blanks, diff){
  var pct=DIFF_PCT[diff]||0;
  if(pct<=0) return [];
  var n=Math.round(blanks.length*pct);
  n=Math.max(2, Math.min(8, n));
  var answerSet={};
  blanks.forEach(function(b){answerSet[cw(b.core)]=true});
  var candidates=(typeof WORDS!=='undefined'?WORDS:[]).filter(function(w){return !answerSet[cw(w.en)]});
  var picked=shuffle(candidates).slice(0, n);
  return picked.map(function(w){return w.en});
}

function loadSentence(){
  selBlank=null; completed=false;
  var s=POOL[st.idx];
  var built=buildParts(s);
  curParts=built.parts; curBlanks=built.blanks;
  var decoys=pickDecoys(curBlanks, st.diff);
  var tiles=curBlanks.map(function(b,i){return {core:b.core, decoy:false, used:false}});
  decoys.forEach(function(w){tiles.push({core:w, decoy:true, used:false})});
  curBank=shuffle(tiles);
  render();
}

function isDone(){return curBlanks.every(function(b){return b.filled})}

function render(){
  var s=POOL[st.idx];
  var diffLabel={base:'기본', d30:'도전(+30%)', d50:'고난도(+50%)'}[st.diff]||'';
  var h='<div class="meta"><span>문장 완성 게임 · '+diffLabel+'</span><span>'+(st.idx+1)+' / '+POOL.length+'</span></div>';
  h+='<div class="card">';
  h+='<div class="sent" id="sent">';
  curParts.forEach(function(p){
    if(p.type==='sp'){h+=esc(p.text)}
    else if(p.type==='text'){h+=esc(p.text)}
    else{
      var b=p.b;
      var cls='blank'+(b.filled?' filled':'')+(selBlank===b?' sel':'');
      var underscores=new Array(b.core.length+1).join('_');
      h+=esc(b.pre)+'<button type="button" class="'+cls+'" data-bi="'+b.bi+'">'+(b.filled?esc(b.core):'<span class="u">'+esc(underscores)+'</span>')+'</button>'+esc(b.post);
    }
  });
  h+='</div>';

  if(!completed){
    h+='<div class="bank"><div class="lab">빈칸에 들어갈 단어를 고르세요 (빈칸을 먼저 선택)</div>';
    curBank.forEach(function(tile,i){
      h+='<button type="button" class="tile'+(tile.used?' used':'')+'" data-ti="'+i+'">'+esc(tile.core)+'</button>';
    });
    h+='</div>';
    h+='<div class="hint" id="hint"></div>';
  }else{
    h+='<div class="done-box"><div class="tag">✓ 완성!</div><div class="ko">'+esc(s.ko)+'</div></div>';
  }
  h+='</div>';

  h+='<div class="pager">';
  h+='<button id="prev"'+(st.idx===0?' disabled':'')+'>‹ 이전 문장</button>';
  h+='<button id="reset">다시 풀기</button>';
  h+='<button id="next" class="primary"'+(st.idx===POOL.length-1?' disabled':'')+'>'+(completed?'다음 문장 →':'건너뛰기 →')+'</button>';
  h+='</div>';
  h+='<button id="toSetup" class="reset">난이도 다시 고르기</button>';

  gameEl.innerHTML=h;
  save();

  document.getElementById('sent').addEventListener('click', function(e){
    var t=e.target.closest('.blank'); if(!t) return;
    var bi=+t.getAttribute('data-bi');
    var b=curBlanks[bi];
    if(b.filled){
      b.filled=false;
      var tile=curBank.filter(function(tl){return tl.used && !tl.decoy && cw(tl.core)===cw(b.core)})[0];
      if(tile) tile.used=false;
      selBlank=null; completed=false;
      render();
      return;
    }
    selBlank=(selBlank===b)?null:b;
    render();
  });

  var bankEl=gameEl.querySelector('.bank');
  if(bankEl){
    bankEl.addEventListener('click', function(e){
      var t=e.target.closest('.tile'); if(!t) return;
      var ti=+t.getAttribute('data-ti');
      var tile=curBank[ti];
      if(tile.used) return;
      if(!selBlank){
        document.getElementById('hint').textContent='먼저 채울 빈칸을 눌러 선택하세요.';
        return;
      }
      if(!tile.decoy && cw(tile.core)===cw(selBlank.core)){
        selBlank.filled=true;
        tile.used=true;
        selBlank=null;
        if(isDone()) completed=true;
        render();
      }else{
        t.classList.add('shake');
        setTimeout(function(){t.classList.remove('shake')}, 300);
        document.getElementById('hint').textContent='이 빈칸에 맞는 단어가 아니에요. 다시 골라보세요.';
      }
    });
  }

  document.getElementById('prev').onclick=function(){
    if(st.idx>0){st.idx--; loadSentence()}
  };
  document.getElementById('next').onclick=function(){
    if(completed && st.done.indexOf(st.idx)===-1) st.done.push(st.idx);
    if(st.idx<POOL.length-1){st.idx++; loadSentence()}
  };
  document.getElementById('reset').onclick=function(){
    loadSentence();
  };
  document.getElementById('toSetup').onclick=function(){
    showSetup();
  };
}
})();
