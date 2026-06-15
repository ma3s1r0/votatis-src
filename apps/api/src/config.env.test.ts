import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

// 단위 테스트: env 파싱. 실 DB/S3 연결 없음.
const baseEnv = {
  DATABASE_URL: "postgres://u:p@host:5432/db",
  AWS_REGION: "ap-northeast-2",
  S3_BUCKET: "votatis-attachments",
  AWS_ACCESS_KEY_ID: "AKIA_TEST",
  AWS_SECRET_ACCESS_KEY: "secret_test",
  SUBMITTER_SALT: "salt_value",
  INVITE_BASE_URL: "https://app.votatis.test/invite",
  CORS_ORIGINS: "https://app.votatis.test,https://admin.votatis.test",
};

describe("loadConfig", () => {
  it("유효 env → 구성 객체 반환", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.databaseUrl).toBe(baseEnv.DATABASE_URL);
    expect(cfg.s3.region).toBe("ap-northeast-2");
    expect(cfg.s3.bucket).toBe("votatis-attachments");
    expect(cfg.s3.accessKeyId).toBe("AKIA_TEST");
    expect(cfg.s3.secretAccessKey).toBe("secret_test");
    expect(cfg.submitterSalt).toBe("salt_value");
    expect(cfg.inviteBaseUrl).toBe("https://app.votatis.test/invite");
  });

  it("CORS_ORIGINS 를 콤마 구분 배열로 파싱(공백 트림)", () => {
    const cfg = loadConfig({ ...baseEnv, CORS_ORIGINS: " https://a.test , https://b.test " });
    expect(cfg.corsOrigins).toEqual(["https://a.test", "https://b.test"]);
  });

  it("CORS_ORIGINS 비어있으면 빈 배열(동일 오리진 배포)", () => {
    const cfg = loadConfig({ ...baseEnv, CORS_ORIGINS: "" });
    expect(cfg.corsOrigins).toEqual([]);
  });

  it("필수 env 누락 시 throw — 누락 키를 메시지에 포함", () => {
    const { DATABASE_URL, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrowError(/DATABASE_URL/);
  });

  it("여러 키 누락 시 모두 메시지에 포함", () => {
    const { DATABASE_URL, S3_BUCKET, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrowError(/DATABASE_URL/);
    expect(() => loadConfig(rest)).toThrowError(/S3_BUCKET/);
  });
});
