import { describe, it, expect } from "vitest";
import { S3Storage } from "./storage.js";

// 단위 테스트: presign URL 생성 로직만 검증(네트워크 호출 없음).
// SigV4 presigned URL 은 순수 계산 — 자격증명/리전/버킷/키/만료가 URL 에 반영되는지 확인.
const storage = new S3Storage({
  region: "ap-northeast-2",
  bucket: "votatis-attachments",
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "testsecret",
});

describe("S3Storage.presignPut", () => {
  it("PUT presigned URL 에 버킷·키·리전·만료·서명 포함", async () => {
    const { url, expiresInSeconds } = await storage.presignPut({
      key: "reports/r1/att1.bin",
      contentType: "application/octet-stream",
      contentLength: 1234,
      expiresInSeconds: 600,
    });
    expect(url).toContain("votatis-attachments");
    expect(url).toContain("reports/r1/att1.bin");
    expect(url).toContain("ap-northeast-2");
    // SigV4 presigned 쿼리 파라미터
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Credential=");
    // 만료(초) 가 쿼리에 반영
    expect(url).toContain("X-Amz-Expires=600");
    expect(expiresInSeconds).toBe(600);
  });

  it("만료가 설정값 이하 — 요청 만료 그대로 반영", async () => {
    const { url } = await storage.presignPut({
      key: "k",
      contentType: "image/png",
      contentLength: 10,
      expiresInSeconds: 300,
    });
    expect(url).toContain("X-Amz-Expires=300");
  });
});

describe("S3Storage 세션 토큰(Lambda 실행 역할 임시 자격증명)", () => {
  // Lambda 실행 역할은 임시 자격증명(AccessKey+Secret+SessionToken)을 주입한다.
  // SessionToken 없이 SigV4 서명하면 S3 가 403(InvalidToken) → presigned URL 에
  // X-Amz-Security-Token 이 반영되는지 확인(회귀: "키만 넣으면" Lambda S3 실패).
  it("sessionToken 주입 시 presigned URL 에 X-Amz-Security-Token 포함", async () => {
    const temp = new S3Storage({
      region: "ap-northeast-2",
      bucket: "votatis-attachments",
      accessKeyId: "ASIATEMPKEY",
      secretAccessKey: "tempsecret",
      sessionToken: "FwoTESTsessiontoken==",
    });
    const { url } = await temp.presignPut({
      key: "reports/r1/att1.bin",
      contentType: "image/png",
      contentLength: 10,
      expiresInSeconds: 600,
    });
    expect(url).toContain("X-Amz-Security-Token=");
  });

  it("sessionToken 미지정 시 X-Amz-Security-Token 없음(정적 키 호환)", async () => {
    const { url } = await storage.presignPut({
      key: "k",
      contentType: "image/png",
      contentLength: 10,
      expiresInSeconds: 600,
    });
    expect(url).not.toContain("X-Amz-Security-Token");
  });
});

describe("S3Storage.presignGet", () => {
  it("GET presigned URL 에 버킷·키·서명 포함", async () => {
    const { url, expiresInSeconds } = await storage.presignGet({
      key: "reports/r1/att1.bin",
      expiresInSeconds: 120,
    });
    expect(url).toContain("votatis-attachments");
    expect(url).toContain("reports/r1/att1.bin");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=120");
    expect(expiresInSeconds).toBe(120);
  });
});
