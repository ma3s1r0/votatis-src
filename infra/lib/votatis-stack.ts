import * as path from "path";
import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
  CfnParameter,
  Fn,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Trigger } from "aws-cdk-lib/triggers";

// 아티팩트 경로(미리 빌드: apps/api `pnpm build:lambda`, apps/web `pnpm build`).
const REPO = path.join(__dirname, "..", "..");
const API_ASSET = path.join(REPO, "apps/api/dist/lambda/api");
const MIGRATE_ASSET = path.join(REPO, "apps/api/dist/lambda/migrate");
const WEB_ASSET = path.join(REPO, "apps/web/dist");

// 최소·저비용 테스트 구성(A):
//  - VPC: 2 AZ, NAT 게이트웨이 없음(비용 0). RDS 는 프라이빗 isolated 서브넷.
//  - Lambda(api/migrate)는 VPC 내부 → RDS 에 직접 접근(NAT 불필요).
//  - S3 게이트웨이 엔드포인트로 Lambda→S3(첨부 headObject)를 NAT 없이 처리.
//  - RDS: 단일 AZ, t3.micro(프리티어), 퍼블릭 접근 불가.
//  - web: S3(비공개) + CloudFront(OAC). CloudFront 가 /api/* 를 API GW 로 라우팅 →
//    동일 오리진(쿠키 인증·CORS 불필요).
export class VotatisStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 초대 메일 링크 베이스(0006). 코어 테스트엔 불필요(부트스트랩이 관리자 직접 생성).
    // CloudFront/API 도메인은 순환 의존이라 env 에 못 넣음 → 배포 후 값으로 갱신.
    const inviteBaseUrl = new CfnParameter(this, "InviteBaseUrl", {
      type: "String",
      default: "https://example.invalid",
      description: "관리자 초대 링크 베이스 URL. 첫 배포 후 CloudFront 도메인으로 갱신 권장.",
    });
    const bootstrapAdminEmail = new CfnParameter(this, "BootstrapAdminEmail", {
      type: "String",
      default: "admin@votatis.local",
      description: "마이그레이션 시 생성할 루트 관리자 이메일.",
    });

    // ── VPC (NAT 없음) ─────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    // Lambda(isolated)→S3 를 NAT 없이: S3 게이트웨이 엔드포인트(무료).
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ── 보안 그룹 ──────────────────────────────────────────────────
    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", { vpc });
    const rdsSg = new ec2.SecurityGroup(this, "RdsSg", { vpc });
    rdsSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), "Lambda to Postgres");

    // ── RDS Postgres (단일 AZ, 프라이빗) ───────────────────────────
    const db = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSg],
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      databaseName: "votatis",
      credentials: rds.Credentials.fromGeneratedSecret("votatis"),
      publiclyAccessible: false,
      // 테스트: 스택 삭제 시 함께 제거(데이터 보존 불필요).
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      backupRetention: Duration.days(0),
    });
    const dbSecret = db.secret!;
    // DATABASE_URL 조립(CFN 이 배포 시 시크릿 resolve). 테스트용으로 env 에 직접 주입.
    const databaseUrl = Fn.join("", [
      "postgresql://",
      dbSecret.secretValueFromJson("username").unsafeUnwrap(),
      ":",
      dbSecret.secretValueFromJson("password").unsafeUnwrap(),
      "@",
      db.dbInstanceEndpointAddress,
      ":",
      db.dbInstanceEndpointPort,
      // RDS Postgres 는 SSL 연결 요구(pg_hba). no-verify = SSL 사용 + 인증서 검증 생략(테스트).
      "/votatis?sslmode=no-verify",
    ]);

    // ── 시크릿(앱 솔트 / 부트스트랩 비밀번호) ──────────────────────
    const submitterSalt = new secrets.Secret(this, "SubmitterSalt", {
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });
    const adminPassword = new secrets.Secret(this, "BootstrapAdminPassword", {
      generateSecretString: { passwordLength: 20, excludePunctuation: true },
    });
    const reviewer2Password = new secrets.Secret(this, "Reviewer2Password", {
      generateSecretString: { passwordLength: 20, excludePunctuation: true },
    });

    // ── 첨부 버킷(presigned 업로드 대상) ───────────────────────────
    const attachments = new s3.Bucket(this, "Attachments", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          // 브라우저가 presigned URL 로 직접 PUT/GET(테스트: 모든 오리진 허용).
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
    });

    // ── API Lambda(VPC 내부) ───────────────────────────────────────
    const apiFn = new lambda.Function(this, "Api", {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      handler: "index.handler",
      code: lambda.Code.fromAsset(API_ASSET),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        DATABASE_URL: databaseUrl,
        S3_BUCKET: attachments.bucketName,
        SUBMITTER_SALT: submitterSalt.secretValue.unsafeUnwrap(),
        INVITE_BASE_URL: inviteBaseUrl.valueAsString,
        CORS_ORIGINS: "", // 동일 오리진(CloudFront /api 라우팅) → 비움
      },
    });
    attachments.grantReadWrite(apiFn);

    // ── Migrate/부트스트랩 Lambda(배포 후 1회 수동 호출) ───────────
    const migrateFn = new lambda.Function(this, "Migrate", {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      handler: "index.handler",
      code: lambda.Code.fromAsset(MIGRATE_ASSET),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      memorySize: 512,
      timeout: Duration.seconds(300),
      environment: {
        DATABASE_URL: databaseUrl,
        MIGRATIONS_DIR: "drizzle",
        BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail.valueAsString,
        BOOTSTRAP_ADMIN_PASSWORD: adminPassword.secretValue.unsafeUnwrap(),
        BOOTSTRAP_REVIEWER2_EMAIL: "reviewer2@votatis.local",
        BOOTSTRAP_REVIEWER2_PASSWORD: reviewer2Password.secretValue.unsafeUnwrap(),
      },
    });

    // 배포 중 마이그레이션+부트스트랩 자동 실행(멱등). RDS 준비 후.
    new Trigger(this, "MigrateTrigger", {
      handler: migrateFn,
      executeAfter: [db],
      executeOnHandlerChange: true,
    });

    // ── HTTP API Gateway → API Lambda ──────────────────────────────
    const httpApi = new HttpApi(this, "HttpApi", {
      defaultIntegration: new HttpLambdaIntegration("ApiInt", apiFn),
    });
    const apiDomain = Fn.select(1, Fn.split("://", httpApi.apiEndpoint));

    // ── web: S3(비공개) + CloudFront(OAC) ──────────────────────────
    const webBucket = new s3.Bucket(this, "Web", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        // /api/* → API GW(동일 오리진). 캐시 끔, 쿠키·헤더 전달(Host 제외).
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // SPA 폴백: S3 가 없는 경로는 index.html 로.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources: [s3deploy.Source.asset(WEB_ASSET)],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ── 출력 ───────────────────────────────────────────────────────
    new CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "MigrateFunctionName", {
      value: migrateFn.functionName,
    });
    new CfnOutput(this, "DbSecretArn", { value: dbSecret.secretArn });
    new CfnOutput(this, "AdminPasswordSecretArn", {
      value: adminPassword.secretArn,
    });
    new CfnOutput(this, "AttachmentsBucket", { value: attachments.bucketName });
  }
}
