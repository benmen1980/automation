Refactor and configure the project so deployment uses many independent pipelines, not one monolithic pipeline.

Core rule:
A git push to master must deploy only the service whose files changed.

Required deployment model:

1. The main API/dashboard must have its own pipeline.
2. Each integration must have its own independent pipeline.
3. Adding or changing files under integrations/<integration-name>/** must not redeploy or restart the main API/dashboard app.
4. The Elastic Beanstalk API pipeline must not trigger on integrations/** changes.
5. The API must not import or execute integration code directly.
6. The API should only enqueue jobs and show job status.
7. Integrations should run as independent workers, preferably Lambda by default.
8. Use ECS/Fargate only for long-running or heavy integrations.

Required pipelines:

Pipeline: api-dashboard
Watches:

* apps/api/**
* packages/shared/**
* infra/aws/api/**
* buildspec-api-eb.yml

Deploys:

* Elastic Beanstalk API/dashboard app

Must NOT watch:

* integrations/**

Pipeline: integration-gmail-priority
Watches:

* integrations/gmail-priority/**
* packages/shared/**
* infra/aws/integrations/**
* buildspec-lambda-integration.yml

Deploys:

* gmail-priority Lambda
* gmail-priority SQS queue config if needed
* gmail-priority DLQ config if needed
* gmail-priority EventBridge schedule if needed

Pipeline: integration-shopify-priority
Watches:

* integrations/shopify-priority/**
* packages/shared/**
* infra/aws/integrations/**
* buildspec-lambda-integration.yml

Deploys:

* shopify-priority Lambda
* shopify-priority SQS queue config if needed
* shopify-priority DLQ config if needed
* shopify-priority EventBridge schedule if needed

Pipeline: integration-salesforce-priority
Watches:

* integrations/salesforce-priority/**
* packages/shared/**
* infra/aws/integrations/**
* buildspec-lambda-integration.yml

Deploys:

* salesforce-priority Lambda
* salesforce-priority SQS queue config if needed
* salesforce-priority DLQ config if needed
* salesforce-priority EventBridge schedule if needed

Important behavior:

* If I push a change only to integrations/gmail-priority/**, only the gmail-priority pipeline should run.
* The API/dashboard pipeline should not run.
* The live API/dashboard app should not restart.
* If I push a change to apps/api/**, only the API/dashboard pipeline should run.
* If I push a change to packages/shared/**, document whether all dependent services should deploy or create a dependency mapping so only affected services deploy.

Create reusable AWS CLI scripts/templates:

* create-pipeline-api.sh
* create-pipeline-integration.sh
* create-new-integration-pipeline.sh
* create-sqs-for-integration.sh
* create-lambda-for-integration.sh
* create-eventbridge-schedule-for-integration.sh

The create-new-integration-pipeline.sh script should accept:

* integration name
* runtime type: lambda or fargate
* branch name, default master
* GitHub owner
* GitHub repo
* CodeConnection ARN
* AWS region

Example:
./infra/aws/scripts/create-new-integration-pipeline.sh
--integration bellboy-priority
--runtime lambda
--branch master

This should create a new independent pipeline that watches only:

* integrations/bellboy-priority/**
* packages/shared/**
* buildspec-lambda-integration.yml

Acceptance checklist:

1. There is no single pipeline that deploys the whole repo.
2. The API/dashboard pipeline excludes integrations/**.
3. Every integration has its own pipeline.
4. Every integration has its own deployable artifact.
5. Every integration has its own Lambda or Fargate service.
6. Every integration has its own CloudWatch log group.
7. Every integration has its own SQS queue and DLQ when queue processing is used.
8. A broken integration deployment must not affect the API/dashboard deployment.
9. A broken integration runtime must not crash the API/dashboard.
10. Documentation explains exactly what happens on git push master for each folder.
