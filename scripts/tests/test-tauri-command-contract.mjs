import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { API } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";

const rootArgument = process.argv.indexOf("--root");
const root = path.resolve(
  rootArgument >= 0 ? process.argv[rootArgument + 1] : process.cwd(),
);
const strictGeneratedPermissions = process.argv.includes("--strict-generated-permissions");
const EXPECTED_COMMAND_COUNT = 71;
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function sorted(values) {
  return [...values].sort();
}

function compareSets(label, actual, expected) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    fail(`${label}: expected ${JSON.stringify(expectedSorted)}, got ${JSON.stringify(actualSorted)}`);
  }
}

function commandToPermission(command) {
  return `allow-${command.replaceAll("_", "-")}`;
}

function propertyName(property) {
  if (!property.name) {
    return null;
  }
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function extractTypeScriptInvokes(sourceFile) {
  const invokes = [];

  function visit(node, wrapperName = null) {
    let activeWrapper = wrapperName;
    if (ts.isFunctionDeclaration(node) && node.name) {
      activeWrapper = node.name.text;
    }
    if (
      activeWrapper &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "invoke"
    ) {
      const commandArgument = node.arguments[0];
      const payloadArgument = node.arguments[1];
      const command =
        commandArgument && ts.isStringLiteral(commandArgument) ? commandArgument.text : null;
      const payloadKeys = [];
      let payloadValid = !!payloadArgument && ts.isObjectLiteralExpression(payloadArgument);
      if (payloadValid) {
        for (const property of payloadArgument.properties) {
          const key = propertyName(property);
          if (!key || (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))) {
            payloadValid = false;
            break;
          }
          payloadKeys.push(key);
        }
      }
      if (!command || !payloadValid) {
        fail(`TypeScript invoke in ${activeWrapper} is not a literal command and object payload`);
      } else {
        invokes.push({ command, wrapper: activeWrapper, payloadKeys });
      }
    }
    node.forEachChild((child) => visit(child, activeWrapper));
  }

  visit(sourceFile);
  return invokes;
}

function extractRustCommands(sourceText) {
  const handler = sourceText.match(/generate_handler!\s*\[([\s\S]*?)\]/);
  if (!handler) {
    fail("Rust generate_handler! list is missing");
    return [];
  }
  return [...handler[1].matchAll(/\b(zone_bridge::(?:simulation_loop|attachment_center)|zone_bridge|codex_app_server|ai_provider|release|close_protocol)::([A-Za-z0-9_]+)\b/g)].map(
    ([, sourceModule, command]) => ({
      rustModule: sourceModule.startsWith("zone_bridge") ? "zone_bridge" : sourceModule,
      command,
    }),
  );
}

function extractBuildCommands(sourceText) {
  const commandList = sourceText.match(/commands\s*\(\s*&\[([\s\S]*?)\]\s*\)/);
  if (!commandList) {
    fail("Rust build.rs command list is missing");
    return [];
  }
  return [...commandList[1].matchAll(/"([a-z0-9_]+)"/g)].map(([, command]) => command);
}

function extractPermissionCommand(permissionText, command) {
  const allowPattern = new RegExp(
    `identifier\\s*=\\s*"${commandToPermission(command)}"[\\s\\S]*?commands\\.allow\\s*=\\s*\\["${command}"\\]`,
  );
  const denyPattern = new RegExp(
    `identifier\\s*=\\s*"deny-${commandToPermission(command).slice("allow-".length)}"[\\s\\S]*?commands\\.deny\\s*=\\s*\\["${command}"\\]`,
  );
  return allowPattern.test(permissionText) && denyPattern.test(permissionText);
}

function check() {
  const requiredPaths = [
    "contracts/tauri-commands.v1.json",
    "src-tauri/src/lib.rs",
    "src-tauri/build.rs",
    "src-tauri/capabilities/default.json",
    "src/app/desktop-api.ts",
  ];
  const missingRequiredPaths = [];
  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(path.join(root, requiredPath))) {
      fail(`required contract source is missing: ${requiredPath}`);
      missingRequiredPaths.push(requiredPath);
    }
  }
  if (missingRequiredPaths.length > 0) {
    return;
  }
  let registry;
  try {
    registry = JSON.parse(read("contracts/tauri-commands.v1.json"));
  } catch (error) {
    fail(`registry JSON is invalid: ${error.message}`);
    return;
  }

  const commands = Array.isArray(registry.commands) ? registry.commands : [];
  if (commands.length !== EXPECTED_COMMAND_COUNT) {
    fail(`registry must contain exactly ${EXPECTED_COMMAND_COUNT} commands, got ${commands.length}`);
  }
  const commandNames = commands.map((entry) => entry.command);
  if (new Set(commandNames).size !== commandNames.length) {
    fail("registry command set contains duplicates");
  }
  compareSets("registry command set", commandNames, [...new Set(commandNames)]);

  for (const entry of commands) {
    if (!entry.command || !entry.rust_module || !entry.ts_wrapper || !entry.permission) {
      fail(`registry entry is incomplete: ${JSON.stringify(entry)}`);
      continue;
    }
    if (entry.permission !== commandToPermission(entry.command)) {
      fail(`permission mismatch for ${entry.command}`);
    }
    if (!Array.isArray(entry.payload_keys) || entry.payload_keys.some((key) => typeof key !== "string")) {
      fail(`payload_keys must be a string array for ${entry.command}`);
    }
  }

  const rustCommands = extractRustCommands(read("src-tauri/src/lib.rs"));
  compareSets(
    "Rust command set",
    rustCommands.map(({ command }) => command),
    commandNames,
  );
  const expectedRustByCommand = new Map(commands.map((entry) => [entry.command, entry.rust_module]));
  for (const item of rustCommands) {
    if (expectedRustByCommand.get(item.command) !== item.rustModule) {
      fail(`Rust module mismatch for ${item.command}: got ${item.rustModule}`);
    }
  }

  const buildCommands = extractBuildCommands(read("src-tauri/build.rs"));
  compareSets("Rust build.rs command set", buildCommands, commandNames);

  let capability;
  try {
    capability = JSON.parse(read("src-tauri/capabilities/default.json"));
  } catch (error) {
    fail(`capability JSON is invalid: ${error.message}`);
    capability = { permissions: [] };
  }
  const expectedPermissions = ["core:default", ...commands.map((entry) => entry.permission)];
  compareSets("capability permission set", capability.permissions ?? [], expectedPermissions);

  const permissionDirectory = path.join(root, "src-tauri", "permissions", "autogenerated");
  const generatedFiles = fs
    .readdirSync(permissionDirectory)
    .filter((file) => file.endsWith(".toml"));
  for (const entry of commands) {
    const permissionPath = path.join(permissionDirectory, `${entry.command}.toml`);
    if (!fs.existsSync(permissionPath) || !extractPermissionCommand(fs.readFileSync(permissionPath, "utf8"), entry.command)) {
      fail(`generated permission does not exactly register ${entry.command}`);
    }
  }
  if (strictGeneratedPermissions) {
    compareSets(
      "generated permission file set",
      generatedFiles.map((file) => file.slice(0, -5)),
      commandNames,
    );
  }

  const desktopApiPath = path.join(root, "src", "app", "desktop-api.ts");
  const typeScriptApi = new API({ cwd: root });
  let invokes = [];
  try {
    const snapshot = typeScriptApi.updateSnapshot({ openFiles: [desktopApiPath] });
    const project = snapshot.getDefaultProjectForFile(desktopApiPath);
    const sourceFile = project?.program.getSourceFile(desktopApiPath);
    if (!sourceFile) {
      fail("TypeScript AST could not load src/app/desktop-api.ts");
    } else {
      invokes = extractTypeScriptInvokes(sourceFile);
    }
  } catch (error) {
    fail(`TypeScript AST analysis failed: ${error.message}`);
  } finally {
    typeScriptApi.close();
  }
  if (invokes.length !== EXPECTED_COMMAND_COUNT) {
    fail(`desktop-api.ts must contain exactly ${EXPECTED_COMMAND_COUNT} invoke wrappers, got ${invokes.length}`);
  }
  const expectedByCommand = new Map(commands.map((entry) => [entry.command, entry]));
  compareSets(
    "TypeScript command set",
    invokes.map(({ command }) => command),
    commandNames,
  );
  for (const invoke of invokes) {
    const expected = expectedByCommand.get(invoke.command);
    if (!expected) {
      continue;
    }
    if (invoke.wrapper !== expected.ts_wrapper) {
      fail(`TypeScript wrapper mismatch for ${invoke.command}: got ${invoke.wrapper}`);
    }
    if (JSON.stringify(invoke.payloadKeys) !== JSON.stringify(expected.payload_keys)) {
      fail(
        `payload keys mismatch for ${invoke.command}: expected ${JSON.stringify(expected.payload_keys)}, got ${JSON.stringify(invoke.payloadKeys)}`,
      );
    }
  }
}

check();
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[FAIL] ${failure}`);
  }
  process.exitCode = 1;
} else {
    console.log(`Tauri command contract passed: ${EXPECTED_COMMAND_COUNT} commands, exact Rust/capability/permission/TypeScript sets.`);
}
