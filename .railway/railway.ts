import {defineRailway,project,service,volume,bucket,ref,preserve} from 'railway/iac';

// Plan-only until the new project's bounded hosting spend is approved.
// Explicitly reject the account's unrelated existing project.
export default defineRailway(ctx=>{
 if(ctx.projectName!=='usufruct'||ctx.environment!=='production')throw new Error('Only the isolated usufruct production environment is supported');
 const data=volume('endpoint-data',{region:'europe-west4-drams3a',sizeMB:1024});
 const proofs=bucket('endpoint-proofs',{region:'ams'});
 const operations=service('endpoint-operations',{
  // Source is deliberately omitted: deploy a reviewed checkout with railway up.
  build:{builder:'DOCKERFILE',dockerfilePath:'Dockerfile.operations'},
  healthcheck:'/healthz',healthcheckTimeout:120,replicas:{'europe-west4-drams3a':1},
  deploy:{sleepApplication:false,restartPolicyType:'ON_FAILURE',restartPolicyMaxRetries:10,
   overlapSeconds:0,drainingSeconds:45,requiredMountPath:'/data',
   limitOverride:{containers:{cpu:1,memoryBytes:536870912}}},
  volumeMounts:{'/data':data},
  env:{NODE_ENV:'production',OPERATIONS_DATA_DIR:'/data',PORT:'8789',
   SEPOLIA_RPC_URL:preserve(),OPERATIONS_GATEWAY_TOKEN:preserve(),
   KEEPER_ENABLED:preserve(),KEEPER_EXPECTED_SIGNER:preserve(),KEEPER_PRIVATE_KEY:preserve(),
   PROOF_S3_ENDPOINT:ref(proofs,'ENDPOINT'),PROOF_S3_BUCKET:ref(proofs,'BUCKET'),PROOF_S3_REGION:ref(proofs,'REGION'),
   PROOF_S3_ACCESS_KEY_ID:ref(proofs,'ACCESS_KEY_ID'),PROOF_S3_SECRET_ACCESS_KEY:ref(proofs,'SECRET_ACCESS_KEY')},
 });
 return project('usufruct',{resources:[operations,data,proofs]});
});
