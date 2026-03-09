import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const ROOT_DIR = path.resolve(process.cwd(), "..");
const BIN_PATH = path.join(ROOT_DIR, "cli", "vm_riskxvii");
const TMP_DIR = path.join(process.cwd(), ".tmp");

async function execVm(programPath: string, stdin: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(BIN_PATH, [programPath], {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let combined = "";

    child.stdout.on("data", (data) => {
      combined += data.toString();
    });

    child.stderr.on("data", (data) => {
      combined += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, output: combined.trim() });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  try {
    await fs.access(BIN_PATH);
  } catch {
    return Response.json(
      {
        error: "vm_riskxvii binary not found. Build it first with `make` in project root (or `make -C cli`)."
      },
      { status: 400 }
    );
  }

  const data = await request.formData();
  const program = data.get("program");
  const stdin = String(data.get("stdin") ?? "");

  if (!(program instanceof File)) {
    return Response.json({ error: "Missing program file." }, { status: 400 });
  }

  if (!program.name.endsWith(".mi")) {
    return Response.json({ error: "Program file must end with .mi" }, { status: 400 });
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  const runId = randomUUID();
  const tmpProgramPath = path.join(TMP_DIR, `${runId}.mi`);

  try {
    const bytes = Buffer.from(await program.arrayBuffer());
    await fs.writeFile(tmpProgramPath, bytes);

    const result = await execVm(tmpProgramPath, stdin);

    return Response.json({
      code: result.code,
      output: result.output || "(no output)"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run error";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(tmpProgramPath, { force: true });
  }
}
