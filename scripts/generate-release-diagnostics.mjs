import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [output, version, commitSha, contamxStatus = "not_tested", simreadStatus = "not_tested"] = process.argv.slice(2);
if (!output || !version || !commitSha) {
  console.error("usage: node scripts/generate-release-diagnostics.mjs <output> <version> <commit_sha> [contamx_status] [simread_status]");
  process.exitCode = 2;
} else {
  const summary = {
    schema_version: 1,
    product: "CONTAM Studio",
    app_version: version,
    commit_sha: commitSha,
    build_kind: "release",
    unsigned_build: true,
    signature: "unsigned",
    architecture: process.arch,
    operating_system: process.platform,
    language: "not_started",
    theme: "not_started",
    tools: {
      contamx: { status: contamxStatus, version: null },
      simread: { status: simreadStatus, version: null },
    },
    recent_run_status: "not_available",
    recent_error_code: null,
    storage: {
      data_directory: "configured_local_data",
      config_directory: "app_config",
      cache_directory: "app_cache",
      log_directory: "app_logs",
      temporary_directory: "app_temp",
    },
    disclosure: "release smoke evidence; no project, attachment, credential, or absolute path content",
  };
  const parent = path.dirname(path.resolve(output));
  fs.mkdirSync(parent, { recursive: true });
  const handle = fs.openSync(output, "wx");
  try {
    fs.writeFileSync(handle, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } finally {
    fs.closeSync(handle);
  }
  console.log(`sanitized release diagnostics: ${path.basename(output)}`);
}
