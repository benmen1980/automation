require('dotenv').config();
const prisma = require('../src/db/client');
const credentials = require('../src/core/credentials');
const secrets = require('../src/core/secrets');
const { getWebhookToken, setWebhookToken } = require('../src/core/webhook-runner');
const { deriveUserUid } = require('../src/core/identity');
const definition = require('../src/integrations/tuf1/priority-delivery-whatsapp/integration');
async function main() {
  const source = await prisma.integration.findFirst({where:{codeFolder:'src/integrations/tuf1/priority-quote-whatsapp'},include:{user:true,webhookSettings:true}});
  if (!source) throw new Error('TUF1 source integration was not found.');
  const user = source.user;
  if (!user.userUid) user.userUid = (await prisma.user.update({where:{id:user.id},data:{userUid:deriveUserUid(user.slug)}})).userUid;
  const data={userId:user.id,assignedUserUid:user.userUid,name:definition.displayName,description:definition.description,slug:'priority-delivery-whatsapp',codeFolder:'src/integrations/tuf1/priority-delivery-whatsapp',type:'webhook',status:'active',version:definition.version,manualRunEnabled:true};
  const integration=await prisma.integration.upsert({where:{automationId:'aut_11928873df0ae7ea'},create:{...data,automationId:'aut_11928873df0ae7ea'},update:data});
  const saved = await prisma.credential.findUnique({where:{integrationId_key:{integrationId:integration.id,key:'ITC_BEARER_TOKEN'}}});
  const values={ITC_TEMPLATE_MESSAGE_URL:definition.credentials[0].defaultValue,ITC_CHANNEL_ID:'whatsapp:+97246960480'};
  if (!saved) {
    const sourceRow=await prisma.credential.findUnique({where:{integrationId_key:{integrationId:source.id,key:'ITC_BEARER_TOKEN'}}});
    if (!sourceRow) throw new Error('TUF1 source ITC token is not configured.');
    values.ITC_BEARER_TOKEN=await secrets.getSecret(source,'ITC_BEARER_TOKEN',sourceRow.valueReference);
    if (!values.ITC_BEARER_TOKEN) throw new Error('TUF1 source ITC token is unavailable.');
  }
  await credentials.saveCredentials(integration,values);
  const webhook=await prisma.webhookSettings.findUnique({where:{integrationId:integration.id}});
  let tokenRef=webhook?.secretTokenReference;
  if (!tokenRef) {
    const token=await getWebhookToken(source);
    if (!token) throw new Error('TUF1 source webhook token is unavailable.');
    tokenRef=await setWebhookToken(integration,token);
  }
  if (!tokenRef) throw new Error('Webhook token is not configured.');
  const webhookUrl='/webhooks/'+definition.integrationKey;
  await prisma.webhookSettings.upsert({where:{integrationId:integration.id},create:{integrationId:integration.id,webhookUrl,secretTokenReference:tokenRef,allowedMethod:'POST',active:true},update:{webhookUrl,secretTokenReference:tokenRef,allowedMethod:'POST',active:true}});
  console.log(JSON.stringify({automationId:integration.automationId,integrationId:integration.id,assignedUser:user.slug,webhookUrl,version:integration.version,credentialsConfigured:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
