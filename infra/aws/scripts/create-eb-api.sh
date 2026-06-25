#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${PROJECT_NAME:=automation}"
: "${EB_ENV:=automation-api}"
: "${EB_PLATFORM:=Node.js 22 running on 64bit Amazon Linux 2023}"

eb init "${PROJECT_NAME}" --region "${AWS_REGION}" --platform "${EB_PLATFORM}"
eb create "${EB_ENV}" --single --instance-type t3.micro
echo "Elastic Beanstalk API environment created: ${EB_ENV}"
