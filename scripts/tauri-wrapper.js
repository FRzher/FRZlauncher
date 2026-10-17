import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Ensure ~/.cargo/bin is in PATH even if the current terminal hasn't refreshed environment variables
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const sep = process.platform === "win32" ? ";" : ":";
if (!process.env.PATH?.includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${sep}${process.env.PATH || ""}`;
}

// Ensure local .temp directory is used to prevent Windows Defender locking AppData/Local/Temp files
const localTemp = path.join(process.cwd(), ".temp");
if (!fs.existsSync(localTemp)) {
  fs.mkdirSync(localTemp, { recursive: true });
}
process.env.TEMP = localTemp;
process.env.TMP = localTemp;

// Ensure isolated CARGO_TARGET_DIR outside Desktop to avoid antivirus locking and STATUS_DLL_INIT_FAILED (0xc0000142)
const cargoTarget = path.join(os.homedir(), ".cargo_target_frz");
if (!fs.existsSync(cargoTarget)) {
  fs.mkdirSync(cargoTarget, { recursive: true });
}
process.env.CARGO_TARGET_DIR = cargoTarget;

const tauriCli = path.join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
