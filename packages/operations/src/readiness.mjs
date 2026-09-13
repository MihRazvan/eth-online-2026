// Operational health is a precondition for new UI commitments, never a payout oracle.
export function operationsStatus({config,keeperEnabled,keeper,retention,replication,proof,clock=Date.now}) {
 const now=clock(),fresh=at=>Number.isSafeInteger(at)&&at<=now+5000&&now-at<=60000;
 const match=value=>String(value?.chainId)===String(config.chainId)&&value?.feeStrip?.toLowerCase()===config.feeStrip.toLowerCase();
 const check=(ready,code)=>({ready:!!ready,code:ready?'READY':code});
 const keeperReady=keeperEnabled===true&&match(keeper)&&fresh(keeper?.observedAtMs)&&keeper?.enabled===true&&keeper?.readyToSign===true&&
  !keeper.lastError&&keeper.missedEndpoints===0&&keeper.discoveryComplete===true;
 const checks={
  protocol:check(config.fundingCommitmentVersion===1,'CONTRACT_UPGRADE_REQUIRED'),
  keeper:check(keeperReady,'KEEPER_NOT_READY'),
  retention:check(retention?.ready===true&&fresh(retention.observedAt)&&proof?.ready===true&&fresh(proof.observedAt),'PROOF_RETENTION_NOT_READY'),
  replication:check(replication?.ready===true&&fresh(replication.observedAt),'OFFHOST_REPLICATION_NOT_READY'),
 };
 return {schemaVersion:1,chainId:String(config.chainId),feeStrip:config.feeStrip,observedAt:now,
  readyForNewSales:Object.values(checks).every(c=>c.ready),checks,allocationAuthority:'contract-only'};
}

export function retentionStatus(store,scope,clock=Date.now) {
 const d=store.deployment(scope),jobs=store.jobs(scope);
 const head=d?.head_number?BigInt(d.head_number):0n;
 const due=jobs.filter(j=>BigInt(j.terms.endBlock)<=head);
 return {observedAt:d?.observed_at??0,ready:!!d?.discovery_complete&&!d.last_error&&
  due.every(j=>['cached-onchain','not-required'].includes(j.state)||(j.state==='retained'&&!!j.artifact_digest&&store.healthy(j.artifact_digest)))&&
  clock()-(d.observed_at??0)<=60000};
}
