// env 파싱 모듈. 필수 키를 검증하고 누락 시 명확한 에러로 fail-fast 한다.
// 비밀(자격증명·DB URL)은 코드가 읽기만 하고 로그에 남기지 않는다(출처는 배포 측).

export type Config = {
  databaseUrl: string;
  s3: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    endpoint?: string;
  };
  submitterSalt: string;
  inviteBaseUrl: string;
  // 0006 쿠키 인증(credentials:include) — 와일드카드 불가. 명시 오리진 목록.
  // 비어있으면 동일 오리진 배포(CORS 헤더 미적용).
  corsOrigins: string[];
};

type EnvSource = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "AWS_REGION",
  "S3_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "SUBMITTER_SALT",
  "INVITE_BASE_URL",
] as const;

function require(env: EnvSource, key: (typeof REQUIRED_KEYS)[number]): string {
  const v = env[key];
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

export function loadConfig(env: EnvSource): Config {
  const missing = REQUIRED_KEYS.filter((k) => {
    const v = env[k];
    return v === undefined || v === "";
  });
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  return {
    databaseUrl: require(env, "DATABASE_URL"),
    s3: {
      region: require(env, "AWS_REGION"),
      bucket: require(env, "S3_BUCKET"),
      accessKeyId: require(env, "AWS_ACCESS_KEY_ID"),
      secretAccessKey: require(env, "AWS_SECRET_ACCESS_KEY"),
      // Lambda 실행 역할은 임시 자격증명 + AWS_SESSION_TOKEN 을 자동 주입한다.
      // 정적 IAM 유저 키로 돌릴 땐 미설정 → undefined.
      sessionToken: env.AWS_SESSION_TOKEN || undefined,
      endpoint: env.S3_ENDPOINT || undefined,
    },
    submitterSalt: require(env, "SUBMITTER_SALT"),
    inviteBaseUrl: require(env, "INVITE_BASE_URL"),
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  };
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
