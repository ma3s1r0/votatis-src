import { describe, it, expect } from "vitest";
import {
  ORIGINAL_PREFIX,
  PUBLIC_PREFIX,
  publicKeyFor,
  FakeMosaic,
} from "./mosaic.js";

// 스토리지 키 prefix 분리(0016 결정 2) 단위검증.
describe("스토리지 키 prefix 분리", () => {
  it("prefix 상수가 original/ · public/ 로 분리된다", () => {
    expect(ORIGINAL_PREFIX).toBe("original/");
    expect(PUBLIC_PREFIX).toBe("public/");
  });

  it("original/ 키는 public/ 으로 치환된다", () => {
    expect(publicKeyFor("original/reports/r1/x.png")).toBe("public/reports/r1/x.png");
  });

  it("public 키는 original/ 을 포함하지 않는다", () => {
    expect(publicKeyFor("original/reports/r1/x.png")).not.toContain(ORIGINAL_PREFIX);
  });
});

// MosaicPort 인터페이스 + FakeMosaic 더블.
describe("FakeMosaic", () => {
  it("process({ originalKey }) → { publicKey }(public/ prefix)", async () => {
    const mosaic = new FakeMosaic();
    const { publicKey } = await mosaic.process({ originalKey: "original/reports/r1/x.png" });
    expect(publicKey).toBe("public/reports/r1/x.png");
    expect(publicKey.startsWith(PUBLIC_PREFIX)).toBe(true);
  });

  it("호출 인자를 기록한다", async () => {
    const mosaic = new FakeMosaic();
    await mosaic.process({ originalKey: "original/reports/r1/a.png" });
    await mosaic.process({ originalKey: "original/reports/r1/b.png" });
    expect(mosaic.calls).toEqual([
      { originalKey: "original/reports/r1/a.png" },
      { originalKey: "original/reports/r1/b.png" },
    ]);
  });
});
