"use client";

import { useMemo, useState } from "react";

type OpCode = "LI" | "ADD" | "SUB" | "MUL" | "DIV" | "PRINT" | "HALT";

type Instruction = {
  id: string;
  op: OpCode;
  rd?: number;
  rs1?: number;
  rs2?: number;
  imm?: number;
};

type VmState = {
  registers: number[];
  pc: number;
  halted: boolean;
  output: string[];
  changedRegisters: number[];
};

const REGISTER_COUNT = 32;
const MAX_STEPS = 1000;

function createVmState(): VmState {
  return {
    registers: Array.from({ length: REGISTER_COUNT }, () => 0),
    pc: 0,
    halted: false,
    output: [],
    changedRegisters: []
  };
}

function parseRegister(raw: string): number {
  const numeric = Number.parseInt(raw, 10);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  return Math.min(REGISTER_COUNT - 1, Math.max(0, numeric));
}

function parseNumber(raw: string): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.trunc(numeric);
}

function toInt32(value: number): number {
  return value | 0;
}

function executeInstruction(state: VmState, instruction: Instruction, programLength: number): VmState {
  if (state.halted || state.pc >= programLength) {
    return {
      ...state,
      halted: true,
      changedRegisters: []
    };
  }

  const next = {
    ...state,
    registers: [...state.registers],
    output: [...state.output],
    changedRegisters: [] as number[]
  };

  const setReg = (index: number, value: number) => {
    if (index === 0) {
      return;
    }
    next.registers[index] = toInt32(value);
    next.changedRegisters.push(index);
  };

  switch (instruction.op) {
    case "LI":
      setReg(instruction.rd ?? 0, instruction.imm ?? 0);
      next.pc += 1;
      break;
    case "ADD":
      setReg(
        instruction.rd ?? 0,
        (next.registers[instruction.rs1 ?? 0] ?? 0) + (next.registers[instruction.rs2 ?? 0] ?? 0)
      );
      next.pc += 1;
      break;
    case "SUB":
      setReg(
        instruction.rd ?? 0,
        (next.registers[instruction.rs1 ?? 0] ?? 0) - (next.registers[instruction.rs2 ?? 0] ?? 0)
      );
      next.pc += 1;
      break;
    case "MUL":
      setReg(
        instruction.rd ?? 0,
        (next.registers[instruction.rs1 ?? 0] ?? 0) * (next.registers[instruction.rs2 ?? 0] ?? 0)
      );
      next.pc += 1;
      break;
    case "DIV": {
      const denominator = next.registers[instruction.rs2 ?? 0] ?? 0;
      if (denominator === 0) {
        next.output.push("Runtime error: division by zero.");
        next.halted = true;
      } else {
        const numerator = next.registers[instruction.rs1 ?? 0] ?? 0;
        setReg(instruction.rd ?? 0, Math.trunc(numerator / denominator));
        next.pc += 1;
      }
      break;
    }
    case "PRINT":
      next.output.push(`R${instruction.rs1 ?? 0} = ${next.registers[instruction.rs1 ?? 0] ?? 0}`);
      next.pc += 1;
      break;
    case "HALT":
      next.output.push("CPU Halt Requested");
      next.halted = true;
      break;
    default:
      next.halted = true;
      next.output.push("Runtime error: unsupported instruction.");
      break;
  }

  next.registers[0] = 0;

  if (next.pc >= programLength) {
    next.halted = true;
    next.output.push("Program finished.");
  }

  return next;
}

function renderInstruction(instruction: Instruction): string {
  switch (instruction.op) {
    case "LI":
      return `LI R${instruction.rd}, ${instruction.imm}`;
    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV":
      return `${instruction.op} R${instruction.rd}, R${instruction.rs1}, R${instruction.rs2}`;
    case "PRINT":
      return `PRINT R${instruction.rs1}`;
    case "HALT":
      return "HALT";
    default:
      return instruction.op;
  }
}

export default function HomePage() {
  const [program, setProgram] = useState<Instruction[]>([]);
  const [vmState, setVmState] = useState<VmState>(() => createVmState());
  const [op, setOp] = useState<OpCode>("LI");
  const [rd, setRd] = useState("1");
  const [rs1, setRs1] = useState("1");
  const [rs2, setRs2] = useState("2");
  const [imm, setImm] = useState("0");

  const canStep = program.length > 0 && !vmState.halted;

  const pcInstruction = useMemo(() => {
    if (vmState.pc < 0 || vmState.pc >= program.length) {
      return null;
    }
    return program[vmState.pc];
  }, [program, vmState.pc]);

  function addInstruction() {
    const next: Instruction = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      op
    };

    if (op === "LI") {
      next.rd = parseRegister(rd);
      next.imm = parseNumber(imm);
    } else if (op === "PRINT") {
      next.rs1 = parseRegister(rs1);
    } else if (op !== "HALT") {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
      next.rs2 = parseRegister(rs2);
    }

    setProgram((prev) => [...prev, next]);
  }

  function removeInstruction(id: string) {
    setProgram((prev) => prev.filter((inst) => inst.id !== id));
    setVmState((prev) => {
      const reset = createVmState();
      return { ...reset, output: [...prev.output, "Program changed. VM reset required."] };
    });
  }

  function resetVm() {
    setVmState(createVmState());
  }

  function clearAll() {
    setProgram([]);
    setVmState(createVmState());
  }

  function step() {
    if (!canStep) {
      return;
    }
    setVmState((prev) => {
      const instruction = program[prev.pc];
      if (!instruction) {
        return {
          ...prev,
          halted: true,
          output: [...prev.output, "Program finished."],
          changedRegisters: []
        };
      }
      return executeInstruction(prev, instruction, program.length);
    });
  }

  function runAll() {
    if (!canStep) {
      return;
    }

    let current = vmState;
    let steps = 0;
    while (!current.halted && current.pc < program.length && steps < MAX_STEPS) {
      current = executeInstruction(current, program[current.pc], program.length);
      steps += 1;
    }

    if (steps >= MAX_STEPS && !current.halted) {
      current = {
        ...current,
        halted: true,
        output: [...current.output, `Execution stopped after ${MAX_STEPS} steps for safety.`]
      };
    }
    setVmState(current);
  }

  return (
    <main>
      <h1>RISK-XVII Online Lab</h1>
      <p className="subtitle">Interactive register-level VM simulator.</p>

      <section className="card usageGuide">
        <h2>Usage Guide</h2>
        <ol>
          <li>Select an operation in the left panel (`LI`, `ADD`, `SUB`, `MUL`, `DIV`, `PRINT`, `HALT`).</li>
          <li>Enter register indexes and/or immediate values based on the selected operation.</li>
          <li>Click `Add Instruction` to append the instruction to the program list.</li>
          <li>Repeat until your program is complete. Add `HALT` to stop explicitly.</li>
          <li>Click `Step` to execute one instruction at a time, or `Run` to execute continuously.</li>
          <li>Watch `PC` and `Next` in the left panel to understand control flow.</li>
          <li>Watch register cards in the right panel; changed registers are highlighted each step.</li>
          <li>Read printed values, runtime errors, and halt messages in the output panel.</li>
          <li>Click `Reset VM` to rerun the current program from the start, or `Clear Program` to rebuild.</li>
        </ol>
      </section>

      <section className="workspace">
        <div className="leftPane">
          <section className="card grid panel">
            <h2>Instruction Builder</h2>

            <div className="row">
              <label htmlFor="op">Operation</label>
              <select id="op" value={op} onChange={(event) => setOp(event.target.value as OpCode)}>
                <option value="LI">LI (load immediate)</option>
                <option value="ADD">ADD</option>
                <option value="SUB">SUB</option>
                <option value="MUL">MUL</option>
                <option value="DIV">DIV</option>
                <option value="PRINT">PRINT</option>
                <option value="HALT">HALT</option>
              </select>
            </div>

            {op === "LI" && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="rd">Target Register (rd)</label>
                  <input
                    id="rd"
                    type="number"
                    min={0}
                    max={31}
                    value={rd}
                    onChange={(event) => setRd(event.target.value)}
                  />
                </div>
                <div className="grid">
                  <label htmlFor="imm">Immediate</label>
                  <input id="imm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
                </div>
              </div>
            )}

            {(op === "ADD" || op === "SUB" || op === "MUL" || op === "DIV") && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="rd2">rd</label>
                  <input
                    id="rd2"
                    type="number"
                    min={0}
                    max={31}
                    value={rd}
                    onChange={(event) => setRd(event.target.value)}
                  />
                </div>
                <div className="grid">
                  <label htmlFor="rs1">rs1</label>
                  <input
                    id="rs1"
                    type="number"
                    min={0}
                    max={31}
                    value={rs1}
                    onChange={(event) => setRs1(event.target.value)}
                  />
                </div>
                <div className="grid">
                  <label htmlFor="rs2">rs2</label>
                  <input
                    id="rs2"
                    type="number"
                    min={0}
                    max={31}
                    value={rs2}
                    onChange={(event) => setRs2(event.target.value)}
                  />
                </div>
              </div>
            )}

            {op === "PRINT" && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="printRs1">Source Register (rs1)</label>
                  <input
                    id="printRs1"
                    type="number"
                    min={0}
                    max={31}
                    value={rs1}
                    onChange={(event) => setRs1(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="actions">
              <button type="button" onClick={addInstruction}>Add Instruction</button>
              <button type="button" className="secondary" onClick={clearAll}>Clear Program</button>
            </div>
          </section>

          <section className="card grid panel">
            <h2>Program</h2>
            {program.length === 0 && <p className="hint">No instructions yet.</p>}
            <ol className="programList">
              {program.map((instruction, index) => (
                <li key={instruction.id} className={vmState.pc === index && !vmState.halted ? "active" : ""}>
                  <code>{renderInstruction(instruction)}</code>
                  <button type="button" className="danger" onClick={() => removeInstruction(instruction.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ol>

            <div className="actions">
              <button type="button" onClick={step} disabled={!canStep}>Step</button>
              <button type="button" onClick={runAll} disabled={!canStep}>Run</button>
              <button type="button" className="secondary" onClick={resetVm}>Reset VM</button>
            </div>
            <p className="hint">
              PC: {vmState.pc} {pcInstruction ? `| Next: ${renderInstruction(pcInstruction)}` : "| Program complete"}
            </p>
          </section>
        </div>

        <div className="rightPane">
          <section className="card grid panel">
            <h2>Registers</h2>
            <div className="registerGrid">
              {vmState.registers.map((value, index) => (
                <div key={index} className={vmState.changedRegisters.includes(index) ? "register changed" : "register"}>
                  <strong>R{index}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card grid panel">
            <h2>Output</h2>
            <section className="output" aria-live="polite">
              {vmState.output.length === 0 ? "Output will appear here." : vmState.output.join("\n")}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}
