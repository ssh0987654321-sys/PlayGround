(() => {
  'use strict';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUIT_NAMES = {'♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs'};
  const money = n => Math.max(0, Math.round(n)).toLocaleString('en-US');
  const players = [
    {name:'You', icon:'♙', stack:1000, human:true},
    {name:'Marlow', icon:'♜', stack:1000},
    {name:'June', icon:'♕', stack:1000},
    {name:'Theo', icon:'♞', stack:1000}
  ];
  const $ = id => document.getElementById(id);
  const dom = {seats:$('seats'), board:$('community-cards'), pot:$('pot-value'), stage:$('stage-label'), kicker:$('status-kicker'), message:$('status-message'), handNo:$('hand-number'), toast:$('hand-toast'), raiseControl:$('raise-control'), slider:$('raise-slider'), raiseValue:$('raise-value'), maxLabel:$('max-label'), actions:$('action-buttons'), fold:$('fold-btn'), check:$('check-btn'), raise:$('raise-btn'), deal:$('deal-btn')};
  let handNo = 0, button = 0, smallBlind = 10, bigBlind = 20, hand = null, timer = null, toastTimer = null, gameOver = false;

  function cardText(card) { return `<span class="rank">${card.r}</span><span class="suit">${card.s}</span><span class="corner-suit">${card.s}</span>`; }
  function cardMarkup(card, back=false) {
    if (back) return '<div class="playing-card back" aria-label="face-down card"></div>';
    return `<div class="playing-card ${card.s==='♥'||card.s==='♦'?'red':''}" aria-label="${card.r} of ${SUIT_NAMES[card.s]}">${cardText(card)}</div>`;
  }
  function shuffleDeck() {
    const deck = SUITS.flatMap(s => RANKS.map((r,i) => ({s,r,v:i+2})));
    for (let i=deck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    return deck;
  }
  function activeSeats() { return players.map((p,i)=>p.stack>0?i:-1).filter(i=>i>=0); }
  function nextSeat(from, predicate=()=>true) {
    for (let step=1;step<=players.length;step++) { const i=(from+step)%players.length; if(predicate(i)) return i; }
    return -1;
  }
  function newHand() {
    clearTimeout(timer); timer=null;
    if (gameOver || players[0].stack<=0) { players.forEach(p=>p.stack=1000); handNo=0; button=0; gameOver=false;dom.deal.querySelector('span:nth-child(2)').textContent='DEAL NEXT HAND'; }
    const able=activeSeats();
    if (able.length<2) { renderGameOver(); return; }
    handNo++; button=able.includes(button)?nextSeat(button,i=>able.includes(i)):able[0];
    hand={deck:shuffleDeck(),board:[],pot:0,currentBet:0,lastRaise:bigBlind,street:'preflop',actor:-1,done:false,showdown:false,winners:[],players:players.map((p,i)=>({ ...p, hand:[], folded:p.stack<=0, allin:false, bet:0, total:0, acted:false, award:0, rank:null }))};
    for(let n=0;n<2;n++) for(const i of able) hand.players[i].hand.push(hand.deck.pop());
    const sb=nextSeat(button,i=>able.includes(i)), bb=nextSeat(sb,i=>able.includes(i));
    postBlind(sb,smallBlind); postBlind(bb,bigBlind);
    hand.currentBet=Math.max(hand.players[sb].bet,hand.players[bb].bet);
    hand.lastRaise=bigBlind;
    hand.actor=nextSeat(bb,canAct);
    if(hand.actor<0) runout();
    render();
    if(hand.actor===0) setStatus('YOUR TURN', 'You’re in the hand. What would you like to do?');
    else { setStatus('THE TABLE IS LIVE', 'The cards are in. Marlow, June and Theo are at the table.'); scheduleActor(); }
  }
  function postBlind(i,amount) { const p=hand.players[i], paid=Math.min(amount,p.stack); p.stack-=paid; p.bet+=paid; p.total+=paid; p.allin=p.stack===0; }
  function canAct(i) { const p=hand.players[i]; return !p.folded&&!p.allin&&p.stack>0; }
  function setStatus(kicker,message) { dom.kicker.textContent=kicker; dom.message.textContent=message; }
  function render() {
    if(!hand) return;
    hand.pot=hand.players.reduce((sum,p)=>sum+p.total,0);
    dom.pot.textContent=money(hand.pot); dom.handNo.textContent=String(handNo).padStart(2,'0');
    dom.stage.textContent=hand.done?(hand.showdown?'SHOWDOWN':'HAND COMPLETE'):({preflop:'PRE-FLOP',flop:'THE FLOP',turn:'THE TURN',river:'THE RIVER'}[hand.street]||'');
    dom.board.innerHTML=hand.board.map(c=>cardMarkup(c)).join('');
    dom.seats.innerHTML=hand.players.map((p,i)=>{
      const cards=p.hand.map(c=>cardMarkup(c, !p.human&&!hand.showdown)).join('');
      const badge=i===button?'<span class="dealer-button">D</span>':'';
      const bet=p.bet>0?`<div class="player-bet"><i class="bet-dot"></i>${money(p.bet)}</div>`:'';
      const current=!hand.done&&i===hand.actor?' current':'';
      const folded=p.folded?' folded':'';
      const thinking=!hand.done&&i===hand.actor&&i!==0?' thinking':'';
      let label=p.folded?'Folded':p.allin?'All in':p.award>0?`Won ${money(p.award)}`:'';
      return `<div class="seat seat-${i}${current}${folded}${thinking}"><div class="avatar">${p.icon}${badge}<div class="hole-cards">${cards}</div></div><div class="player-info"><span class="player-name">${p.name}${label?` · ${label}`:''}</span><span class="player-stack">${money(p.stack)} chips</span></div>${bet}</div>`;
    }).join('');
    dom.toast.classList.toggle('show',!!hand.toast);
    dom.toast.textContent=hand.toast||'';
    const user=hand.players[0], userTurn=!hand.done&&hand.actor===0;
    dom.actions.classList.toggle('disabled',!userTurn); dom.raiseControl.classList.toggle('hidden',!userTurn);
    dom.deal.classList.toggle('visible',hand.done);
    if(userTurn){
      const toCall=Math.max(0,hand.currentBet-user.bet), minTarget=hand.currentBet?hand.currentBet+hand.lastRaise:bigBlind, maxTarget=user.bet+user.stack;
      dom.fold.disabled=false; dom.check.textContent=toCall?'Call '+money(Math.min(toCall,user.stack)):'Check';
      dom.slider.min=String(Math.min(minTarget,maxTarget)); dom.slider.max=String(Math.max(minTarget,maxTarget));
      if(Number(dom.slider.value)<Number(dom.slider.min)||Number(dom.slider.value)>Number(dom.slider.max)) dom.slider.value=String(Number(dom.slider.min));
      dom.slider.step='10'; updateRaiseText(); dom.maxLabel.textContent='MAX '+money(maxTarget);
      dom.raise.disabled=maxTarget<minTarget; dom.raise.textContent=maxTarget<minTarget?'Raise':'Raise to '+money(Number(dom.slider.value));
    }
  }
  function updateRaiseText(){ const value=Number(dom.slider.value);dom.raiseValue.textContent=money(value);dom.raise.textContent='Raise to '+money(value); const min=Number(dom.slider.min),max=Number(dom.slider.max),pct=max===min?100:((value-min)/(max-min))*100;dom.slider.style.background=`linear-gradient(to right,var(--gold) 0%,var(--gold) ${pct}%,#495047 ${pct}%,#495047 100%)`; }

  function takeAction(i,action,target=0) {
    if(!hand||hand.done||hand.actor!==i) return;
    const p=hand.players[i], oldBet=hand.currentBet;
    if(action==='fold') p.folded=true;
    else if(action==='call'||action==='check') { const paid=Math.min(Math.max(0,oldBet-p.bet),p.stack);p.stack-=paid;p.bet+=paid;p.total+=paid;p.allin=p.stack===0; }
    else if(action==='raise') {
      target=Math.min(target,p.bet+p.stack);
      if(target<=oldBet||target<p.bet) return;
      const paid=target-p.bet;p.stack-=paid;p.bet=target;p.total+=paid;p.allin=p.stack===0;
      const raiseBy=target-oldBet;hand.currentBet=target;hand.lastRaise=Math.max(bigBlind,raiseBy);
      hand.players.forEach((other,j)=>{if(j!==i&&!other.folded&&!other.allin)other.acted=false;});
    }
    p.acted=true;
    if(hand.players.filter(x=>!x.folded).length===1){awardUncontested();return;}
    advanceAfterAction(i);
  }
  function advanceAfterAction(i) {
    const stillCan=hand.players.some((p,j)=>!p.folded&&!p.allin&&p.stack>0&&(!p.acted||p.bet<hand.currentBet));
    if(!stillCan){endBettingRound();return;}
    hand.actor=nextSeat(i,j=>canAct(j)&&(!hand.players[j].acted||hand.players[j].bet<hand.currentBet));
    render();
    if(hand.actor===0) setStatus('YOUR TURN', hand.currentBet>hand.players[0].bet?`There are ${money(hand.currentBet-hand.players[0].bet)} chips to call.`:'It’s checked to you.');
    else scheduleActor();
  }
  function endBettingRound() {
    if(hand.street==='river'){showdown();return;}
    hand.players.forEach(p=>{p.bet=0;p.acted=false;});hand.currentBet=0;hand.lastRaise=bigBlind;
    if(hand.street==='preflop'){hand.street='flop';hand.deck.pop();hand.board.push(hand.deck.pop(),hand.deck.pop(),hand.deck.pop());}
    else if(hand.street==='flop'){hand.street='turn';hand.deck.pop();hand.board.push(hand.deck.pop());}
    else if(hand.street==='turn'){hand.street='river';hand.deck.pop();hand.board.push(hand.deck.pop());}
    const first=nextSeat(button,canAct);
    if(first<0){runout();return;}
    hand.actor=first;render();setStatus('YOUR MOVE IS COMING',`${hand.street==='flop'?'The flop is out.':hand.street==='turn'?'The turn is out.':'The river is out.'} ${first===0?'You’re first to act.':players[first].name+' is first to act.'}`);
    if(first!==0)scheduleActor();
  }
  function runout(){
    while(hand.board.length<5){if(hand.board.length===0){hand.deck.pop();hand.board.push(hand.deck.pop(),hand.deck.pop(),hand.deck.pop());}else if(hand.board.length<4){hand.deck.pop();hand.board.push(hand.deck.pop());}else{hand.deck.pop();hand.board.push(hand.deck.pop());}}
    showdown();
  }
  function combinations(cards,n,start=0,picked=[],out=[]){if(picked.length===n){out.push(picked);return out;}for(let i=start;i<=cards.length-(n-picked.length);i++)combinations(cards,n,i+1,[...picked,cards[i]],out);return out;}
  function straightHigh(values){const unique=[...new Set(values)].sort((a,b)=>b-a);if(unique[0]===14)unique.push(1);for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4)return unique[i];return 0;}
  function evaluateFive(cards){
    const values=cards.map(c=>c.v).sort((a,b)=>b-a), counts={};values.forEach(v=>counts[v]=(counts[v]||0)+1);
    const groups=Object.entries(counts).map(([v,n])=>({v:Number(v),n})).sort((a,b)=>b.n-a.n||b.v-a.v);
    const flush=cards.every(c=>c.s===cards[0].s), straight=straightHigh(values);
    if(flush&&straight)return [8,straight];
    if(groups[0].n===4)return [7,groups[0].v,groups[1].v];
    if(groups[0].n===3&&groups[1].n===2)return [6,groups[0].v,groups[1].v];
    if(flush)return [5,...values];
    if(straight)return [4,straight];
    if(groups[0].n===3)return [3,groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)];
    if(groups[0].n===2&&groups[1].n===2)return [2,Math.max(groups[0].v,groups[1].v),Math.min(groups[0].v,groups[1].v),groups[2].v];
    if(groups[0].n===2)return [1,groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)];
    return [0,...values];
  }
  function evaluate(cards){let best=null;for(const five of combinations(cards,5)){const rank=evaluateFive(five);if(!best||compare(rank,best)>0)best=rank;}return best||[0];}
  function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
  const HAND_NAMES=['high card','a pair','two pair','three of a kind','a straight','a flush','a full house','four of a kind','a straight flush'];
  function rankName(rank){return HAND_NAMES[rank[0]]||'high card';}
  function showdown(){
    if(hand.done)return;
    hand.showdown=true;hand.done=true;hand.actor=-1;
    hand.players.forEach(p=>{if(!p.folded)p.rank=evaluate([...p.hand,...hand.board]);});
    const levels=[...new Set(hand.players.map(p=>p.total).filter(n=>n>0))].sort((a,b)=>a-b);let previous=0;
    for(const level of levels){const contributors=hand.players.filter(p=>p.total>=level),amount=(level-previous)*contributors.length;previous=level;const eligible=contributors.filter(p=>!p.folded);if(!eligible.length)continue;
      let best=eligible[0].rank,winners=[eligible[0]];
      for(const p of eligible.slice(1)){const cmp=compare(p.rank,best);if(cmp>0){best=p.rank;winners=[p];}else if(cmp===0)winners.push(p);}
      const share=Math.floor(amount/winners.length),remainder=amount%winners.length;winners.forEach((p,i)=>{p.award+=share+(i<remainder?1:0);});
    }
    hand.players.forEach(p=>p.stack+=p.award);
    const winners=hand.players.filter(p=>p.award>0);hand.winners=winners;
    let summary;
    if(winners.length===1){const w=winners[0];summary=`${w.name} wins ${money(w.award)} with ${rankName(w.rank)}.`;}
    else summary=`Split pot — ${winners.map(w=>w.name).join(' & ')} share ${money(winners.reduce((n,w)=>n+w.award,0))}.`;
    hand.toast=summary;render();setStatus('SHOWDOWN',summary);showToast(summary);
  }
  function awardUncontested(){const winner=hand.players.find(p=>!p.folded);const amount=hand.players.reduce((n,p)=>n+p.total,0);winner.stack+=amount;winner.award=amount;hand.done=true;hand.actor=-1;hand.toast=`${winner.name} takes the pot of ${money(amount)}.`;render();setStatus('POT AWARDED',hand.toast);showToast(hand.toast);}
  function showToast(text){clearTimeout(toastTimer);hand.toast=text;render();toastTimer=setTimeout(()=>{if(hand){hand.toast='';render();}},3200);}
  function renderGameOver(){
    gameOver=true;hand=null;dom.pot.textContent='0';dom.board.innerHTML='';dom.stage.textContent='TABLE CLOSED';dom.seats.innerHTML='';dom.toast.classList.remove('show');dom.actions.classList.add('disabled');dom.raiseControl.classList.add('hidden');dom.deal.classList.add('visible');dom.deal.querySelector('span:nth-child(2)').textContent='START A NEW GAME';
    setStatus('GAME OVER','The table needs at least two players with chips. Start fresh for another game.');
  }
  dom.slider.addEventListener('input',updateRaiseText);
  dom.fold.addEventListener('click',()=>takeAction(0,'fold'));
  dom.check.addEventListener('click',()=>takeAction(0,hand&&hand.currentBet>hand.players[0].bet?'call':'check'));
  dom.raise.addEventListener('click',()=>takeAction(0,'raise',Number(dom.slider.value)));
  dom.deal.addEventListener('click',newHand);
  $('sound-toggle').addEventListener('click',event=>{
    const button=event.currentTarget,enabled=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'Sound is on':'Sound is off';$('sound-icon').textContent=enabled?'♫':'♪';
  });
  newHand();
})();
  function scheduleActor(){
    clearTimeout(timer);if(!hand||hand.done||hand.actor<0)return;
    timer=setTimeout(()=>{if(!hand||hand.done)return;const i=hand.actor;if(i===0)return;const decision=botDecision(i);takeAction(i,decision.action,decision.target);},650+Math.random()*550);
  }
  function botDecision(i){
    const p=hand.players[i],toCall=Math.max(0,hand.currentBet-p.bet),pot=Math.max(1,hand.players.reduce((n,x)=>n+x.total,0));
    let strength;
    if(hand.board.length<3){const a=p.hand[0].v,b=p.hand[1].v,high=Math.max(a,b),low=Math.min(a,b),pair=a===b;strength=(pair?.35+(high-2)*.018:.08+(high+low-4)*.009)+(p.hand[0].s===p.hand[1].s?.045:0)+(high-low<=2?.025:0);}
    else {const rank=evaluate([...p.hand,...hand.board]);strength=[.12,.35,.55,.72,.83,.88,.94,.98,1][rank[0]];}
    const price=toCall/(pot+toCall),noise=(Math.random()-.5)*.16;
    if(toCall>0&&strength+noise<Math.max(.13,price*.88))return {action:'fold'};
    const minTarget=hand.currentBet?hand.currentBet+hand.lastRaise:bigBlind,maxTarget=p.bet+p.stack;
    const canRaise=maxTarget>=minTarget;
    const aggressive=strength>=(hand.street==='preflop'?.59:.64)&&Math.random()<(strength>.86?.42:.2);
    if(canRaise&&aggressive){const target=Math.min(maxTarget,Math.max(minTarget,hand.currentBet?hand.currentBet+hand.lastRaise:bigBlind));return {action:'raise',target};}
    return {action:toCall?'call':'check'};
  }
