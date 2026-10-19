// A test driver with a short view of already-visible obstacles. Predictions do
// not generate future traffic or consume the live game's seeded random stream.
export function chooseAction(game) {
  const actions=[];
  for(const lane of [game.lane,game.lane-1,game.lane+1].filter(l=>l>=-1&&l<=1)) {
    for(const held of [false,true]) {
      const probe=Object.assign(Object.create(Object.getPrototypeOf(game)),game,{
        events:game.events.map(e=>({...e})),traffic:game.traffic.map(o=>({...o})),
        autoSpawn:false,trafficEnabled:false,random:()=>.5,
      });
      probe.moveLane(lane-probe.lane);probe.setHeld(held);
      for(let i=0;i<36&&probe.phase==='running';i++)probe.update(1/30);
      const cost=(probe.phase==='over'?10000:0)+(held?20:0)+Math.abs(lane-game.lane)*2;
      actions.push({lane,held,cost});
    }
  }
  return actions.sort((a,b)=>a.cost-b.cost)[0];
}

export function drive(game,seconds,hz=60) {
  for(let i=0;i<seconds*hz&&game.phase==='running';i++) {
    if(i%Math.max(1,Math.round(hz/10))===0) {
      const action=chooseAction(game);
      game.moveLane(action.lane-game.lane);game.setHeld(action.held);
    }
    game.update(1/hz);
  }
}
