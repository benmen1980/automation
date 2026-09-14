describe('delivery automation queue', () => {
  const previous = process.env;
  afterEach(() => { process.env=previous; jest.resetModules(); jest.dontMock('../../src/core/execution-service'); jest.dontMock('@aws-sdk/client-sqs'); });
  test('loads the permanent identity from the database for queue routing and secret resolution', async () => {
    const prisma = require('../../src/db/client');
    const user = await prisma.user.create({data:{slug:'delivery_queue_test',email:'delivery-queue@example.test',name:'Delivery queue test',passwordHash:'test-only'}});
    const integration = await prisma.integration.create({data:{userId:user.id,automationId:'aut_11928873df0ae7ea',name:'Delivery',slug:'priority-delivery-whatsapp',type:'webhook',codeFolder:'src/integrations/tuf1/priority-delivery-whatsapp'}});
    const execution = await prisma.execution.create({data:{userId:user.id,integrationId:integration.id,triggerType:'manual',executionMode:'test'}});
    const loaded = await require('../../src/core/execution-service').getExecutionForQueue(execution.id);
    expect(loaded.integration.automationId).toBe(integration.automationId);
    await prisma.$disconnect();
  });
  test('routes the delivery automation to its own SQS queue while the platform uses local mode', async () => {
    jest.resetModules();
    process.env={...previous,QUEUE_MODE:'local',SQS_QUEUE_URL_INT_1A8136B51DB455EE:'https://sqs.test/delivery',INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL:'https://automation.example.test'};
    const send=jest.fn(async()=>({MessageId:'delivery-message'}));
    jest.doMock('@aws-sdk/client-sqs',()=>({SQSClient:class{send(command){return send(command);}},SendMessageCommand:class{constructor(input){this.input=input;}}}));
    const payload={DOCUMENTS_D:{ORDNAME:'1597873',CURDATE:' 2026-07-27 ',YARD_CUSTDES:'Contact',YARD_PHONENUM:'+972502009253',YARD_NAME:'Second',YARD_FAX:'+972502009254'}};
    const execution={id:'delivery-execution',integrationId:'delivery-id',userId:'tuf-user',executionMode:'test',triggerType:'manual',inputPayload:JSON.stringify(payload),integration:{id:'delivery-id',automationId:'aut_11928873df0ae7ea',slug:'priority-delivery-whatsapp',name:'Delivery',codeFolder:'src/integrations/tuf1/priority-delivery-whatsapp',credentials:[{key:'ITC_BEARER_TOKEN',isSecret:true,valueReference:'automation/aut_11928873df0ae7ea/ITC_BEARER_TOKEN'}]},user:{id:'tuf-user',slug:'user_005'}};
    jest.doMock('../../src/core/execution-service',()=>({getExecutionForQueue:jest.fn(async()=>execution),markQueued:jest.fn(async()=>({status:'queued'}))}));
    const result=await require('../../src/core/queue').enqueueExecution(execution.id);
    expect(result.status).toBe('queued');
    expect(send).toHaveBeenCalledTimes(1);
    const request=send.mock.calls[0][0].input;
    expect(request.QueueUrl).toBe(process.env.SQS_QUEUE_URL_INT_1A8136B51DB455EE);
    const job=JSON.parse(request.MessageBody);expect(job.payload).toEqual(payload);expect(job.credentialReferences.ITC_BEARER_TOKEN).toBe('automation/aut_11928873df0ae7ea/ITC_BEARER_TOKEN');
  });
});
