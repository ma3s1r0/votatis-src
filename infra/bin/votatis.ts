#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VotatisStack } from "../lib/votatis-stack";

const app = new cdk.App();

// 리전/계정은 자격증명 환경(CDK_DEFAULT_*)에서 가져온다. 미지정 시 env-agnostic.
new VotatisStack(app, "VotatisTest", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-2",
  },
  description:
    "Votatis 최소·저비용 테스트 배포(A) — S3+CloudFront(web), API GW+Lambda(api), 단일 AZ RDS(no NAT).",
});
