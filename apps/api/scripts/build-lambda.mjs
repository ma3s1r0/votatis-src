// Lambda 배포 아티팩트 빌드(Docker 없이 Linux 타깃).
//
// 왜 직접 빌드하나: 인증 해시에 네이티브 모듈 @node-rs/argon2 를 쓴다. esbuild 로
// JS 는 번들하되 네이티브(.node)는 external 로 두고, Linux 플랫폼 바이너리를 함께
// 동봉해야 Lambda(Linux)에서 동작한다. CDK 자동 번들(NodejsFunction)은 호스트
// 플랫폼으로 install 하므로 macOS 에서 돌리면 darwin 바이너리가 들어가 실패한다.
// → 루트 package.json pnpm.supportedArchitectures 로 linux-x64 바이너리를 받고(.pnpm),
//   이 스크립트로 아티팩트를 조립한 뒤 CDK 는 Code.fromAsset(prebuilt) 로 집는다.
//
// argon2 v2 로더는 로컬 `./argon2.<platform>.node` 를 먼저 require 하므로, Linux
// 바이너리를 argon2 패키지 폴더에 직접 넣으면 부속 패키지 해석에 의존하지 않는다.
//
// 산출물: apps/api/dist/lambda/{api,migrate}/  (각 index.mjs + node_modules + 부속)

import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, "..");
const repoRoot = resolve(apiDir, "..", "..");
const outRoot = join(apiDir, "dist", "lambda");
const require = createRequire(join(apiDir, "package.json"));

// 네이티브(.node)는 번들 불가 → external. pg-native 는 선택적 require(미설치).
const EXTERNAL = ["@node-rs/argon2", "pg-native"];

// argon2 JS 패키지의 실제 경로(pnpm 심링크 해제).
const ARGON2_DIR = realpathSync(
  dirname(require.resolve("@node-rs/argon2/package.json")),
);

// pnpm .pnpm 스토어에서 linux-x64-gnu .node 바이너리 파일을 찾는다.
function findLinuxBinary() {
  const pnpmDir = join(repoRoot, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const match = readdirSync(pnpmDir).find((d) =>
    d.startsWith("@node-rs+argon2-linux-x64-gnu@"),
  );
  if (!match) return null;
  const file = join(
    pnpmDir,
    match,
    "node_modules",
    "@node-rs",
    "argon2-linux-x64-gnu",
    "argon2.linux-x64-gnu.node",
  );
  return existsSync(file) ? file : null;
}

async function bundle(entry, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(apiDir, "src", entry)],
    outfile: join(outDir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    external: EXTERNAL,
    // ESM 번들에서 require/__dirname 을 쓰는 CJS 의존성 호환.
    banner: {
      js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
    },
    logLevel: "info",
  });

  // external argon2 를 런타임 해석 가능하도록 JS 패키지 동봉.
  const dest = join(outDir, "node_modules", "@node-rs", "argon2");
  cpSync(ARGON2_DIR, dest, { recursive: true, dereference: true });
  // package.json 을 ESM 아티팩트로 만들었으므로(type:module) 패키지 루트에 둔다.
  writeFileSync(
    join(outDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2),
  );
  return dest;
}

async function main() {
  rmSync(outRoot, { recursive: true, force: true });
  const apiArgon2 = await bundle("lambda.ts", join(outRoot, "api"));
  const migrateArgon2 = await bundle("migrate.ts", join(outRoot, "migrate"));

  // migrate 는 드리즐 SQL/저널을 런타임에 읽는다(MIGRATIONS_DIR 기본 "drizzle").
  cpSync(join(apiDir, "drizzle"), join(outRoot, "migrate", "drizzle"), {
    recursive: true,
  });

  // Linux 바이너리를 argon2 패키지 폴더에 직접 주입(로더 1순위 경로).
  const linuxBin = findLinuxBinary();
  if (!linuxBin) {
    console.warn(
      "\n⚠️  @node-rs/argon2-linux-x64-gnu 미발견 — 이 아티팩트는 Lambda(Linux)에서 argon2 로드 실패.\n" +
        "   배포 전: 루트 package.json 의 pnpm.supportedArchitectures 설정 확인 후 `pnpm install` 재실행.\n",
    );
  } else {
    for (const dir of [apiArgon2, migrateArgon2]) {
      cpSync(linuxBin, join(dir, "argon2.linux-x64-gnu.node"));
    }
    console.log("✓ argon2.linux-x64-gnu.node 동봉(Linux 바이너리)");
  }

  console.log(`\n✓ Lambda 아티팩트: ${outRoot}/{api,migrate}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
