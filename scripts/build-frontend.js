import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const localTemp = path.join(process.cwd(), ".temp");
if (!fs.existsSync(localTemp)) {
  fs.mkdirSync(localTemp, { recursive: true });
}
process.env.TEMP = localTemp;
process.env.TMP = localTemp;

execSync("npx tsc && npx vite build", { stdio: "inherit", env: process.env });
