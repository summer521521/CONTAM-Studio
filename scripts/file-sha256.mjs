import fs from "node:fs";
import crypto from "node:crypto";
const file = process.argv[2];
if (!file) process.exit(2);
process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
