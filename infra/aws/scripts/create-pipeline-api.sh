#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${PROJECT_NAME:=automation}"
: "${REPO_ID:=benmen1980/automation}"
: "${BRANCH:=master}"

echo "Create a CodePipeline named ${PROJECT_NAME}-api with:"
echo "- Source: GitHub connection, ${REPO_ID}, branch ${BRANCH}"
echo "- Path filter: apps/api/**, src/**, prisma/**, frontend/dashboard/**, packages/shared/**"
echo "- Build: buildspec-api-eb.yml"
echo "- Deploy: Elastic Beanstalk API environment"
echo "This script documents the pipeline shape; wire IAM role ARNs and connection ARN per account."
