/** Signal each child once, then await every exit within the same grace period. */
export function childShutdown({children,graceMs=30000}){
 const waits=new Map();let stopping=false;
 function request(child){
  if(!child||waits.has(child))return;
  if(!child.pid||child.exitCode!==null||child.signalCode!==null){waits.set(child,Promise.resolve());return;}
  waits.set(child,new Promise(resolve=>{
   let timer;
   const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};
   child.once('exit',done);
   timer=setTimeout(()=>child.kill('SIGKILL'),graceMs);
   child.kill('SIGTERM');
  }));
 }
 return {
  stop(){if(stopping)return;stopping=true;for(const child of children())request(child);},
  async drain(){this.stop();for(const child of children())request(child);await Promise.all(waits.values());},
 };
}

/** Bound open HTTP connections independently of child cleanup. */
export async function drainServer(server,{graceMs=10000}={}){
 if(!server)return;
 await new Promise(resolve=>{
  const timer=setTimeout(()=>server.closeAllConnections(),graceMs);
  server.close(()=>{clearTimeout(timer);resolve();});
 });
}
