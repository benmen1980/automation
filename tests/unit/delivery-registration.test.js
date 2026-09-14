jest.mock('../../src/core/credentials',()=>({saveCredentials:jest.fn(async()=>{})}));
jest.mock('../../src/core/secrets',()=>({getSecret:jest.fn(async()=> 'test-token-not-secret')}));
jest.mock('../../src/core/webhook-runner',()=>({getWebhookToken:jest.fn(async()=> 'test-webhook'),setWebhookToken:jest.fn(async()=> 'test-reference')}));
const prisma=require('../../src/db/client');
const {main}=require('../../scripts/register-priority-delivery-itc');
const {integrationAccessWhere,canAccessIntegration}=require('../../src/core/permissions');
test('registering delivery preserves legacy visibility and respects existing assignments',async()=>{
  const owner=await prisma.user.create({data:{slug:'legacy_tuf',email:'legacy-tuf@example.test',name:'TUF1',passwordHash:'test'}});
  const other=await prisma.user.create({data:{slug:'other_tuf_test',userUid:'usr_other_tuf_test',email:'other-tuf@example.test',name:'Other',passwordHash:'test'}});
  const source=await prisma.integration.create({data:{userId:owner.id,name:'Source',slug:'source',type:'webhook',codeFolder:'src/integrations/tuf1/priority-quote-whatsapp'}});
  const legacy=await prisma.integration.create({data:{userId:owner.id,name:'Legacy',slug:'legacy',type:'webhook',codeFolder:'src/integrations/tuf1/priority-quote-whatsapp'}});
  const reassigned=await prisma.integration.create({data:{userId:owner.id,assignedUserUid:other.userUid,name:'Reassigned',slug:'reassigned',type:'webhook',codeFolder:'src/integrations/tuf1/priority-quote-whatsapp'}});
  await prisma.credential.create({data:{userId:owner.id,integrationId:source.id,key:'ITC_BEARER_TOKEN',type:'secret',isSecret:true,valueReference:'test-reference'}});
  const log=jest.spyOn(console,'log').mockImplementation(()=>{});
  try {await main();const user=await prisma.user.findUnique({where:{id:owner.id}});const visible=await prisma.integration.findMany({where:integrationAccessWhere(user)});expect(visible.map(i=>i.id)).toEqual(expect.arrayContaining([source.id,legacy.id]));expect(visible).toHaveLength(3);expect(visible.every(i=>canAccessIntegration(user,i))).toBe(true);expect((await prisma.integration.findUnique({where:{id:reassigned.id}})).assignedUserUid).toBe(other.userUid);
    await prisma.integration.update({where:{id:legacy.id},data:{assignedUserUid:null}});await main();expect((await prisma.integration.findUnique({where:{id:legacy.id}})).assignedUserUid).toBeNull();
  }finally{log.mockRestore();await prisma.$disconnect();}
});
