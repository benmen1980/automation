#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
PROJECT_NAME="${PROJECT_NAME:-automation}"
PIPELINE_NAME="${PIPELINE_NAME:-${PROJECT_NAME}-api}"
CODEBUILD_PROJECT="${CODEBUILD_PROJECT:-${PIPELINE_NAME}-build}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-}"
GITHUB_OWNER="${GITHUB_OWNER:-}"
GITHUB_REPO="${GITHUB_REPO:-automation}"
BRANCH="${BRANCH:-master}"
CONNECTION_ARN="${CONNECTION_ARN:-}"
EB_APPLICATION="${EB_APPLICATION:-${PROJECT_NAME}}"
EB_ENVIRONMENT="${EB_ENVIRONMENT:-automation-api}"
CODEPIPELINE_ROLE_ARN="${CODEPIPELINE_ROLE_ARN:-}"
CODEBUILD_ROLE_ARN="${CODEBUILD_ROLE_ARN:-}"
CREATE_ROLES="${CREATE_ROLES:-false}"
CODEBUILD_IMAGE="${CODEBUILD_IMAGE:-aws/codebuild/standard:7.0}"

usage() {
  cat <<'USAGE'
Create or update the API/dashboard pipeline from GitHub to Elastic Beanstalk.

Required:
  --github-owner OWNER
  --github-repo REPO
  --connection-arn ARN
  --eb-application NAME
  --eb-environment NAME

Role options:
  Pass --codepipeline-role-arn and --codebuild-role-arn, or pass --create-roles
  to let this script create scoped default roles for this pipeline.

Optional:
  --region REGION                 Default: eu-west-1
  --project-name NAME             Default: automation
  --pipeline-name NAME            Default: <project-name>-api
  --codebuild-project NAME        Default: <pipeline-name>-build
  --artifact-bucket NAME          Default: <pipeline-name>-artifacts-<account>-<region>
  --branch NAME                   Default: master
  --codebuild-image IMAGE         Default: aws/codebuild/standard:7.0

Environment variables with the same names are also supported.

Example:
  ./infra/aws/scripts/create-pipeline-api.sh \
    --github-owner benmen1980 \
    --github-repo automation \
    --connection-arn arn:aws:codestar-connections:eu-west-1:123456789012:connection/abc \
    --eb-application automation \
    --eb-environment automation-api \
    --create-roles
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) AWS_REGION="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    --pipeline-name) PIPELINE_NAME="$2"; shift 2 ;;
    --codebuild-project) CODEBUILD_PROJECT="$2"; shift 2 ;;
    --artifact-bucket) ARTIFACT_BUCKET="$2"; shift 2 ;;
    --github-owner) GITHUB_OWNER="$2"; shift 2 ;;
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --connection-arn) CONNECTION_ARN="$2"; shift 2 ;;
    --eb-application) EB_APPLICATION="$2"; shift 2 ;;
    --eb-environment) EB_ENVIRONMENT="$2"; shift 2 ;;
    --codepipeline-role-arn) CODEPIPELINE_ROLE_ARN="$2"; shift 2 ;;
    --codebuild-role-arn) CODEBUILD_ROLE_ARN="$2"; shift 2 ;;
    --codebuild-image) CODEBUILD_IMAGE="$2"; shift 2 ;;
    --create-roles) CREATE_ROLES="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

require() {
  local value="$1"
  local name="$2"
  if [[ -z "${value}" ]]; then
    echo "Missing required value: ${name}" >&2
    usage
    exit 1
  fi
}

require "${GITHUB_OWNER}" "--github-owner"
require "${GITHUB_REPO}" "--github-repo"
require "${CONNECTION_ARN}" "--connection-arn"
require "${EB_APPLICATION}" "--eb-application"
require "${EB_ENVIRONMENT}" "--eb-environment"

command -v aws >/dev/null 2>&1 || {
  echo "aws CLI is required." >&2
  exit 1
}

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "${AWS_REGION}")"
if [[ -z "${ARTIFACT_BUCKET}" ]]; then
  ARTIFACT_BUCKET="${PIPELINE_NAME}-artifacts-${ACCOUNT_ID}-${AWS_REGION}"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ensure_bucket() {
  if aws s3api head-bucket --bucket "${ARTIFACT_BUCKET}" >/dev/null 2>&1; then
    echo "Artifact bucket exists: ${ARTIFACT_BUCKET}"
    return
  fi

  echo "Creating artifact bucket: ${ARTIFACT_BUCKET}"
  if [[ "${AWS_REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${ARTIFACT_BUCKET}" --region "${AWS_REGION}" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "${ARTIFACT_BUCKET}" \
      --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}" >/dev/null
  fi

  aws s3api put-bucket-versioning \
    --bucket "${ARTIFACT_BUCKET}" \
    --versioning-configuration Status=Enabled \
    --region "${AWS_REGION}" >/dev/null

  aws s3api put-public-access-block \
    --bucket "${ARTIFACT_BUCKET}" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
    --region "${AWS_REGION}" >/dev/null
}

create_role_if_needed() {
  if [[ "${CREATE_ROLES}" != "true" ]]; then
    require "${CODEPIPELINE_ROLE_ARN}" "--codepipeline-role-arn or --create-roles"
    require "${CODEBUILD_ROLE_ARN}" "--codebuild-role-arn or --create-roles"
    return
  fi

  local pipeline_role="${PIPELINE_NAME}-role"
  local build_role="${CODEBUILD_PROJECT}-role"

  cat > "${TMP_DIR}/codepipeline-trust.json" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "codepipeline.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  cat > "${TMP_DIR}/codebuild-trust.json" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "codebuild.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  if ! aws iam get-role --role-name "${pipeline_role}" >/dev/null 2>&1; then
    echo "Creating CodePipeline role: ${pipeline_role}"
    aws iam create-role \
      --role-name "${pipeline_role}" \
      --assume-role-policy-document "file://${TMP_DIR}/codepipeline-trust.json" >/dev/null
  fi

  if ! aws iam get-role --role-name "${build_role}" >/dev/null 2>&1; then
    echo "Creating CodeBuild role: ${build_role}"
    aws iam create-role \
      --role-name "${build_role}" \
      --assume-role-policy-document "file://${TMP_DIR}/codebuild-trust.json" >/dev/null
  fi

  CODEPIPELINE_ROLE_ARN="$(aws iam get-role --role-name "${pipeline_role}" --query Role.Arn --output text)"
  CODEBUILD_ROLE_ARN="$(aws iam get-role --role-name "${build_role}" --query Role.Arn --output text)"

  cat > "${TMP_DIR}/codepipeline-policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": [
        "arn:aws:s3:::${ARTIFACT_BUCKET}",
        "arn:aws:s3:::${ARTIFACT_BUCKET}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:BatchGetBuilds",
        "codebuild:StartBuild"
      ],
      "Resource": "arn:aws:codebuild:${AWS_REGION}:${ACCOUNT_ID}:project/${CODEBUILD_PROJECT}"
    },
    {
      "Effect": "Allow",
      "Action": "codestar-connections:UseConnection",
      "Resource": "${CONNECTION_ARN}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "elasticbeanstalk:CreateApplicationVersion",
        "elasticbeanstalk:DescribeApplications",
        "elasticbeanstalk:DescribeApplicationVersions",
        "elasticbeanstalk:DescribeEnvironments",
        "elasticbeanstalk:UpdateEnvironment"
      ],
      "Resource": "*"
    }
  ]
}
JSON

  cat > "${TMP_DIR}/codebuild-policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/codebuild/${CODEBUILD_PROJECT}",
        "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/codebuild/${CODEBUILD_PROJECT}:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::${ARTIFACT_BUCKET}",
        "arn:aws:s3:::${ARTIFACT_BUCKET}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:CreateReportGroup",
        "codebuild:CreateReport",
        "codebuild:UpdateReport",
        "codebuild:BatchPutTestCases",
        "codebuild:BatchPutCodeCoverages"
      ],
      "Resource": "arn:aws:codebuild:${AWS_REGION}:${ACCOUNT_ID}:report-group/${CODEBUILD_PROJECT}-*"
    }
  ]
}
JSON

  aws iam put-role-policy \
    --role-name "${pipeline_role}" \
    --policy-name "${PIPELINE_NAME}-inline" \
    --policy-document "file://${TMP_DIR}/codepipeline-policy.json" >/dev/null

  aws iam put-role-policy \
    --role-name "${build_role}" \
    --policy-name "${CODEBUILD_PROJECT}-inline" \
    --policy-document "file://${TMP_DIR}/codebuild-policy.json" >/dev/null

  echo "IAM roles ready. Waiting briefly for IAM propagation."
  sleep 10
}

upsert_codebuild_project() {
  cat > "${TMP_DIR}/codebuild-source.json" <<JSON
{
  "type": "CODEPIPELINE",
  "buildspec": "buildspec-api-eb.yml"
}
JSON

  cat > "${TMP_DIR}/codebuild-artifacts.json" <<'JSON'
{
  "type": "CODEPIPELINE"
}
JSON

  cat > "${TMP_DIR}/codebuild-environment.json" <<JSON
{
  "type": "LINUX_CONTAINER",
  "image": "${CODEBUILD_IMAGE}",
  "computeType": "BUILD_GENERAL1_SMALL",
  "privilegedMode": false,
  "environmentVariables": [
    { "name": "NODE_ENV", "value": "test", "type": "PLAINTEXT" },
    { "name": "DEPLOY_TARGET", "value": "elastic-beanstalk-api", "type": "PLAINTEXT" }
  ]
}
JSON

  if aws codebuild batch-get-projects \
    --names "${CODEBUILD_PROJECT}" \
    --region "${AWS_REGION}" \
    --query 'projects[0].name' \
    --output text | grep -qx "${CODEBUILD_PROJECT}"; then
    echo "Updating CodeBuild project: ${CODEBUILD_PROJECT}"
    aws codebuild update-project \
      --name "${CODEBUILD_PROJECT}" \
      --source "file://${TMP_DIR}/codebuild-source.json" \
      --artifacts "file://${TMP_DIR}/codebuild-artifacts.json" \
      --environment "file://${TMP_DIR}/codebuild-environment.json" \
      --service-role "${CODEBUILD_ROLE_ARN}" \
      --region "${AWS_REGION}" >/dev/null
  else
    echo "Creating CodeBuild project: ${CODEBUILD_PROJECT}"
    aws codebuild create-project \
      --name "${CODEBUILD_PROJECT}" \
      --source "file://${TMP_DIR}/codebuild-source.json" \
      --artifacts "file://${TMP_DIR}/codebuild-artifacts.json" \
      --environment "file://${TMP_DIR}/codebuild-environment.json" \
      --service-role "${CODEBUILD_ROLE_ARN}" \
      --region "${AWS_REGION}" >/dev/null
  fi
}

upsert_pipeline() {
  local repo_id="${GITHUB_OWNER}/${GITHUB_REPO}"

  cat > "${TMP_DIR}/pipeline.json" <<JSON
{
  "pipeline": {
    "name": "${PIPELINE_NAME}",
    "roleArn": "${CODEPIPELINE_ROLE_ARN}",
    "artifactStore": {
      "type": "S3",
      "location": "${ARTIFACT_BUCKET}"
    },
    "pipelineType": "V2",
    "executionMode": "QUEUED",
    "triggers": [
      {
        "provider": "Connection",
        "gitConfiguration": {
          "sourceActionName": "ApplicationSource",
          "push": [
            {
              "branches": {
                "includes": ["${BRANCH}"]
              },
              "filePaths": {
                "includes": [
                  "apps/api/**",
                  "src/**",
                  "frontend/dashboard/**",
                  "packages/shared/**",
                  "prisma/**",
                  ".platform/**",
                  ".ebextensions/**",
                  "package.json",
                  "package-lock.json",
                  "buildspec-api-eb.yml"
                ],
                "excludes": [
                  "integrations/**",
                  "src/integrations/**"
                ]
              }
            }
          ]
        }
      }
    ],
    "stages": [
      {
        "name": "Source",
        "actions": [
          {
            "name": "ApplicationSource",
            "actionTypeId": {
              "category": "Source",
              "owner": "AWS",
              "provider": "CodeStarSourceConnection",
              "version": "1"
            },
            "runOrder": 1,
            "configuration": {
              "ConnectionArn": "${CONNECTION_ARN}",
              "FullRepositoryId": "${repo_id}",
              "BranchName": "${BRANCH}",
              "OutputArtifactFormat": "CODE_ZIP",
              "DetectChanges": "false"
            },
            "outputArtifacts": [
              { "name": "SourceOutput" }
            ],
            "inputArtifacts": []
          }
        ]
      },
      {
        "name": "Build",
        "actions": [
          {
            "name": "BuildApiDashboard",
            "actionTypeId": {
              "category": "Build",
              "owner": "AWS",
              "provider": "CodeBuild",
              "version": "1"
            },
            "runOrder": 1,
            "configuration": {
              "ProjectName": "${CODEBUILD_PROJECT}"
            },
            "inputArtifacts": [
              { "name": "SourceOutput" }
            ],
            "outputArtifacts": [
              { "name": "BuildOutput" }
            ]
          }
        ]
      },
      {
        "name": "Deploy",
        "actions": [
          {
            "name": "DeployElasticBeanstalk",
            "actionTypeId": {
              "category": "Deploy",
              "owner": "AWS",
              "provider": "ElasticBeanstalk",
              "version": "1"
            },
            "runOrder": 1,
            "configuration": {
              "ApplicationName": "${EB_APPLICATION}",
              "EnvironmentName": "${EB_ENVIRONMENT}"
            },
            "inputArtifacts": [
              { "name": "BuildOutput" }
            ],
            "outputArtifacts": []
          }
        ]
      }
    ]
  }
}
JSON

  if aws codepipeline get-pipeline --name "${PIPELINE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "Updating CodePipeline: ${PIPELINE_NAME}"
    aws codepipeline update-pipeline \
      --cli-input-json "file://${TMP_DIR}/pipeline.json" \
      --region "${AWS_REGION}" >/dev/null
  else
    echo "Creating CodePipeline: ${PIPELINE_NAME}"
    aws codepipeline create-pipeline \
      --cli-input-json "file://${TMP_DIR}/pipeline.json" \
      --region "${AWS_REGION}" >/dev/null
  fi
}

ensure_bucket
create_role_if_needed
upsert_codebuild_project
upsert_pipeline

cat <<EOF
API/dashboard pipeline is ready.

Pipeline: ${PIPELINE_NAME}
Source: ${GITHUB_OWNER}/${GITHUB_REPO} (${BRANCH})
Build: ${CODEBUILD_PROJECT} using buildspec-api-eb.yml
Deploy: Elastic Beanstalk ${EB_APPLICATION}/${EB_ENVIRONMENT}
Artifact bucket: ${ARTIFACT_BUCKET}

Trigger behavior:
- Runs on ${BRANCH} pushes touching API/dashboard files.
- Includes apps/api/**, src/**, frontend/dashboard/**, packages/shared/**, prisma/**, EB config, package files, and buildspec-api-eb.yml.
- Excludes integrations/** and src/integrations/** so integration-only changes do not restart Elastic Beanstalk.
EOF
