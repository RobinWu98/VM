"use client";

import { useMemo, useState } from "react";

type OpCode =
  | "LI"
  | "ADD"
  | "SUB"
  | "AND"
  | "OR"
  | "XOR"
  | "NOT"
  | "SHL"
  | "SHR"
  | "SAR"
  | "LB"
  | "LH"
  | "LW"
  | "LBU"
  | "LHU"
  | "SB"
  | "SH"
  | "SW"
  | "PRINT"
  | "HALT";

type Instruction = {
  id: string;
  op: OpCode;
  rd?: number;
  rs1?: number;
  rs2?: number;
  imm?: number;
};

type Flags = {
  z: number;
  n: number;
  c: number;
  v: number;
};

type StepTrace = {
  pcBefore: number;
  pcAfter: number;
  instruction: string;
  lhsU32?: number;
  rhsU32?: number;
  resultU32?: number;
  destBeforeU32?: number;
  changedBits: number[];
  flags: Flags;
  note?: string;
  memoryAddresses: number[];
};

type VmState = {
  registers: number[];
  dataMem: number[];
  pc: number;
  halted: boolean;
  output: string[];
  changedRegisters: number[];
  changedMemory: number[];
  lastTrace: StepTrace | null;
};

const REGISTER_COUNT = 32;
const DATA_MEM_START = 0x400;
const DATA_MEM_SIZE = 1024;
const DATA_MEM_END = DATA_MEM_START + DATA_MEM_SIZE - 1;
const MAX_STEPS = 1000;

function createVmState(): VmState {
  return {
    registers: Array.from({ length: REGISTER_COUNT }, () => 0),
    dataMem: Array.from({ length: DATA_MEM_SIZE }, () => 0),
    pc: 0,
    halted: false,
    output: [],
    changedRegisters: [],
    changedMemory: [],
    lastTrace: null
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

function toU32(value: number): number {
  return value >>> 0;
}

function toHex32(value: number): string {
  return `0x${toU32(value).toString(16).padStart(8, "0")}`;
}

function toHex16(value: number): string {
  return `0x${(value & 0xffff).toString(16).padStart(4, "0")}`;
}

function toHex8(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

function bitAt(value: number, bit: number): number {
  return (toU32(value) >>> bit) & 1;
}

function signExtend8(value: number): number {
  const byte = value & 0xff;
  return (byte << 24) >> 24;
}

function signExtend16(value: number): number {
  const half = value & 0xffff;
  return (half << 16) >> 16;
}

function buildChangedBits(before: number | undefined, after: number | undefined): number[] {
  if (before === undefined || after === undefined) {
    return [];
  }
  const delta = toU32(before) ^ toU32(after);
  const changed: number[] = [];
  for (let bit = 0; bit < 32; bit += 1) {
    if (((delta >>> bit) & 1) === 1) {
      changed.push(bit);
    }
  }
  return changed;
}

function add32(a: number, b: number) {
  const au = toU32(a);
  const bu = toU32(b);
  const sum = au + bu;
  const result = sum >>> 0;
  const c = sum > 0xffffffff ? 1 : 0;
  const v = ((~(au ^ bu) & (au ^ result)) & 0x80000000) !== 0 ? 1 : 0;
  return { result, c, v };
}

function sub32(a: number, b: number) {
  const au = toU32(a);
  const bu = toU32(b);
  const result = (au - bu) >>> 0;
  const c = au >= bu ? 1 : 0;
  const v = (((au ^ bu) & (au ^ result)) & 0x80000000) !== 0 ? 1 : 0;
  return { result, c, v };
}

function flagsFromResult(resultU32: number, c = 0, v = 0): Flags {
  return {
    z: resultU32 === 0 ? 1 : 0,
    n: ((resultU32 >>> 31) & 1) === 1 ? 1 : 0,
    c,
    v
  };
}

function renderInstruction(instruction: Instruction): string {
  switch (instruction.op) {
    case "LI":
      return `LI R${instruction.rd}, ${instruction.imm}`;
    case "NOT":
      return `NOT R${instruction.rd}, R${instruction.rs1}`;
    case "LB":
    case "LH":
    case "LW":
    case "LBU":
    case "LHU":
      return `${instruction.op} R${instruction.rd}, [R${instruction.rs1} + ${instruction.imm ?? 0}]`;
    case "SB":
    case "SH":
    case "SW":
      return `${instruction.op} R${instruction.rs2}, [R${instruction.rs1} + ${instruction.imm ?? 0}]`;
    case "ADD":
    case "SUB":
    case "AND":
    case "OR":
    case "XOR":
    case "SHL":
    case "SHR":
    case "SAR":
      return `${instruction.op} R${instruction.rd}, R${instruction.rs1}, R${instruction.rs2}`;
    case "PRINT":
      return `PRINT R${instruction.rs1}`;
    case "HALT":
      return "HALT";
    default:
      return instruction.op;
  }
}

function executeInstruction(state: VmState, instruction: Instruction, programLength: number): VmState {
  if (state.halted || state.pc >= programLength) {
    return {
      ...state,
      halted: true,
      changedRegisters: [],
      changedMemory: []
    };
  }

  const next: VmState = {
    ...state,
    registers: [...state.registers],
    dataMem: [...state.dataMem],
    output: [...state.output],
    changedRegisters: [],
    changedMemory: [],
    lastTrace: {
      pcBefore: state.pc,
      pcAfter: state.pc,
      instruction: renderInstruction(instruction),
      changedBits: [],
      flags: { z: 0, n: 0, c: 0, v: 0 },
      memoryAddresses: []
    }
  };

  const setReg = (index: number, value: number) => {
    if (index === 0) {
      return;
    }
    next.registers[index] = toInt32(value);
    next.changedRegisters.push(index);
  };

  const markMemory = (memoryIndex: number) => {
    if (!next.changedMemory.includes(memoryIndex)) {
      next.changedMemory.push(memoryIndex);
    }
    if (next.lastTrace) {
      const address = DATA_MEM_START + memoryIndex;
      if (!next.lastTrace.memoryAddresses.includes(address)) {
        next.lastTrace.memoryAddresses.push(address);
      }
    }
  };

  const setByte = (memoryIndex: number, value: number) => {
    const normalized = value & 0xff;
    if (next.dataMem[memoryIndex] !== normalized) {
      next.dataMem[memoryIndex] = normalized;
      markMemory(memoryIndex);
    }
  };

  const resolveAddress = (baseReg: number, imm: number, width: number) => {
    const baseValue = next.registers[baseReg] ?? 0;
    const address = toU32(toInt32(baseValue + imm));
    const memoryIndex = address - DATA_MEM_START;

    if (address < DATA_MEM_START || address > DATA_MEM_END || memoryIndex + width - 1 >= DATA_MEM_SIZE) {
      next.halted = true;
      const text = `Runtime error: memory address ${toHex32(address)} out of range for ${width}-byte access.`;
      next.output.push(text);
      return { ok: false as const, address, memoryIndex: -1, baseValue };
    }

    return { ok: true as const, address, memoryIndex, baseValue };
  };

  const finishAluTrace = (params: {
    lhs?: number;
    rhs?: number;
    result?: number;
    destBefore?: number;
    flags?: Flags;
    note?: string;
  }) => {
    if (!next.lastTrace) {
      return;
    }
    next.lastTrace.lhsU32 = params.lhs === undefined ? undefined : toU32(params.lhs);
    next.lastTrace.rhsU32 = params.rhs === undefined ? undefined : toU32(params.rhs);
    next.lastTrace.resultU32 = params.result === undefined ? undefined : toU32(params.result);
    next.lastTrace.destBeforeU32 = params.destBefore === undefined ? undefined : toU32(params.destBefore);
    next.lastTrace.changedBits = buildChangedBits(params.destBefore, params.result);
    next.lastTrace.flags = params.flags ?? { z: 0, n: 0, c: 0, v: 0 };
    next.lastTrace.note = params.note;
  };

  switch (instruction.op) {
    case "LI": {
      const dst = instruction.rd ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = instruction.imm ?? 0;
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs: result, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "ADD": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const calc = add32(lhs, rhs);
      setReg(dst, calc.result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs, result: calc.result, destBefore: before, flags: flagsFromResult(calc.result, calc.c, calc.v) });
      break;
    }
    case "SUB": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const calc = sub32(lhs, rhs);
      setReg(dst, calc.result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs, result: calc.result, destBefore: before, flags: flagsFromResult(calc.result, calc.c, calc.v) });
      break;
    }
    case "AND": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) & toU32(rhs);
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "OR": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) | toU32(rhs);
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "XOR": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) ^ toU32(rhs);
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "NOT": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = ~toU32(lhs);
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "SHL": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) << shamt;
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "SHR": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) >>> shamt;
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SAR": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toInt32(lhs) >> shamt;
      setReg(dst, result);
      next.pc += 1;
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "LB":
    case "LH":
    case "LW":
    case "LBU":
    case "LHU": {
      const dst = instruction.rd ?? 0;
      const rs1 = instruction.rs1 ?? 0;
      const imm = instruction.imm ?? 0;
      const width = instruction.op === "LW" ? 4 : instruction.op === "LB" || instruction.op === "LBU" ? 1 : 2;
      const resolved = resolveAddress(rs1, imm, width);
      if (!resolved.ok) {
        finishAluTrace({ lhs: resolved.baseValue, rhs: imm, note: "Memory load failed." });
        break;
      }

      const i = resolved.memoryIndex;
      const b0 = next.dataMem[i] ?? 0;
      const b1 = next.dataMem[i + 1] ?? 0;
      const b2 = next.dataMem[i + 2] ?? 0;
      const b3 = next.dataMem[i + 3] ?? 0;

      let loaded = 0;
      if (instruction.op === "LB") {
        loaded = signExtend8(b0);
      } else if (instruction.op === "LBU") {
        loaded = b0;
      } else if (instruction.op === "LH") {
        loaded = signExtend16((b1 << 8) | b0);
      } else if (instruction.op === "LHU") {
        loaded = (b1 << 8) | b0;
      } else {
        loaded = toInt32((b3 << 24) | (b2 << 16) | (b1 << 8) | b0);
      }

      const before = next.registers[dst] ?? 0;
      setReg(dst, loaded);
      next.pc += 1;
      finishAluTrace({
        lhs: resolved.baseValue,
        rhs: imm,
        result: loaded,
        destBefore: before,
        flags: flagsFromResult(toU32(loaded)),
        note: `${instruction.op} from ${toHex32(resolved.address)}`
      });
      break;
    }
    case "SB":
    case "SH":
    case "SW": {
      const rs2 = instruction.rs2 ?? 0;
      const rs1 = instruction.rs1 ?? 0;
      const imm = instruction.imm ?? 0;
      const width = instruction.op === "SW" ? 4 : instruction.op === "SB" ? 1 : 2;
      const resolved = resolveAddress(rs1, imm, width);
      const srcValue = next.registers[rs2] ?? 0;
      if (!resolved.ok) {
        finishAluTrace({ lhs: resolved.baseValue, rhs: imm, result: srcValue, note: "Memory store failed." });
        break;
      }

      const i = resolved.memoryIndex;
      setByte(i, srcValue);
      if (width >= 2) {
        setByte(i + 1, srcValue >>> 8);
      }
      if (width === 4) {
        setByte(i + 2, srcValue >>> 16);
        setByte(i + 3, srcValue >>> 24);
      }

      next.pc += 1;
      finishAluTrace({
        lhs: resolved.baseValue,
        rhs: imm,
        result: srcValue,
        flags: flagsFromResult(toU32(srcValue)),
        note: `${instruction.op} to ${toHex32(resolved.address)}`
      });
      break;
    }
    case "PRINT": {
      const src = instruction.rs1 ?? 0;
      next.output.push(`R${src} = ${next.registers[src] ?? 0}`);
      next.pc += 1;
      finishAluTrace({ note: "PRINT writes to output only." });
      break;
    }
    case "HALT":
      next.output.push("CPU Halt Requested");
      next.halted = true;
      finishAluTrace({ note: "HALT stops the VM." });
      break;
    default:
      next.halted = true;
      next.output.push("Runtime error: unsupported instruction.");
      finishAluTrace({ note: "Unsupported instruction." });
      break;
  }

  next.registers[0] = 0;

  if (next.lastTrace) {
    next.lastTrace.pcAfter = next.pc;
  }

  if (next.pc >= programLength && !next.halted) {
    next.halted = true;
    next.output.push("Program finished.");
  }

  return next;
}

function BinaryRow({ label, value, changedBits }: { label: string; value: number; changedBits: number[] }) {
  const changed = useMemo(() => new Set(changedBits), [changedBits]);

  return (
    <div className="bitRow">
      <div className="bitLabel">{label}</div>
      <div className="bitCells" role="img" aria-label={`${label} as 32-bit binary`}>
        {Array.from({ length: 32 }, (_, offset) => {
          const bit = 31 - offset;
          const val = bitAt(value, bit);
          return (
            <span key={bit} className={changed.has(bit) ? "bitCell changed" : "bitCell"}>
              {val}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [program, setProgram] = useState<Instruction[]>([]);
  const [vmState, setVmState] = useState<VmState>(() => createVmState());
  const [op, setOp] = useState<OpCode>("LI");
  const [rd, setRd] = useState("1");
  const [rs1, setRs1] = useState("1");
  const [rs2, setRs2] = useState("2");
  const [imm, setImm] = useState("0");
  const [memoryWindowStart, setMemoryWindowStart] = useState("1024");

  const canStep = program.length > 0 && !vmState.halted;

  const pcInstruction = useMemo(() => {
    if (vmState.pc < 0 || vmState.pc >= program.length) {
      return null;
    }
    return program[vmState.pc];
  }, [program, vmState.pc]);

  const memoryStart = useMemo(() => {
    const raw = parseNumber(memoryWindowStart);
    const clamped = Math.max(DATA_MEM_START, Math.min(DATA_MEM_END - 63, raw));
    return clamped;
  }, [memoryWindowStart]);

  const memoryRows = useMemo(() => {
    const rows: Array<{ address: number; bytes: number[]; index: number }> = [];
    for (let row = 0; row < 8; row += 1) {
      const address = memoryStart + row * 8;
      const baseIndex = address - DATA_MEM_START;
      rows.push({
        address,
        index: baseIndex,
        bytes: vmState.dataMem.slice(baseIndex, baseIndex + 8)
      });
    }
    return rows;
  }, [memoryStart, vmState.dataMem]);

  const changedMemorySet = useMemo(() => new Set(vmState.changedMemory), [vmState.changedMemory]);

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
    } else if (op === "HALT") {
      // no operands
    } else if (op === "NOT") {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
    } else if (op === "LB" || op === "LH" || op === "LW" || op === "LBU" || op === "LHU") {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
      next.imm = parseNumber(imm);
    } else if (op === "SB" || op === "SH" || op === "SW") {
      next.rs2 = parseRegister(rs2);
      next.rs1 = parseRegister(rs1);
      next.imm = parseNumber(imm);
    } else {
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
          changedRegisters: [],
          changedMemory: []
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

  const trace = vmState.lastTrace;
  const opIsArith3 = op === "ADD" || op === "SUB" || op === "AND" || op === "OR" || op === "XOR" || op === "SHL" || op === "SHR" || op === "SAR";
  const opIsLoad = op === "LB" || op === "LH" || op === "LW" || op === "LBU" || op === "LHU";
  const opIsStore = op === "SB" || op === "SH" || op === "SW";

  return (
    <main>
      <h1>RISK-XVII Online Lab</h1>
      <p className="subtitle">Interactive register + memory VM simulator with bit-level trace.</p>

      <section className="card usageGuide">
        <h2>Usage Guide</h2>
        <ol>
          <li>Select an operation in the left panel (`LI`, ALU ops, load/store ops, `PRINT`, `HALT`).</li>
          <li>For load/store, memory address = `R[rs1] + imm`; valid data memory byte range is `0x400` to `0x7FF`.</li>
          <li>Click `Add Instruction` to append instructions to the program list.</li>
          <li>Use `Step` to execute one instruction and inspect register/memory/bit-level effects.</li>
          <li>Use `Run` to execute continuously until halt/completion or safety step limit.</li>
          <li>Read `Bit Trace` for binary-level changes and `Flags (Z N C V)` for ALU status.</li>
          <li>Read `Memory` panel to inspect byte contents and highlighted writes from the latest step.</li>
          <li>Use `Reset VM` to reset registers and memory, or `Clear Program` to rebuild instruction list.</li>
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
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="XOR">XOR</option>
                <option value="NOT">NOT</option>
                <option value="SHL">SHL (logical left shift)</option>
                <option value="SHR">SHR (logical right shift)</option>
                <option value="SAR">SAR (arithmetic right shift)</option>
                <option value="LB">LB</option>
                <option value="LH">LH</option>
                <option value="LW">LW</option>
                <option value="LBU">LBU</option>
                <option value="LHU">LHU</option>
                <option value="SB">SB</option>
                <option value="SH">SH</option>
                <option value="SW">SW</option>
                <option value="PRINT">PRINT</option>
                <option value="HALT">HALT</option>
              </select>
            </div>

            {op === "LI" && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="rd">Target Register (rd)</label>
                  <input id="rd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="imm">Immediate</label>
                  <input id="imm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
                </div>
              </div>
            )}

            {opIsArith3 && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="rd2">rd</label>
                  <input id="rd2" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="rs1">rs1</label>
                  <input id="rs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="rs2">rs2</label>
                  <input id="rs2" type="number" min={0} max={31} value={rs2} onChange={(event) => setRs2(event.target.value)} />
                </div>
              </div>
            )}

            {op === "NOT" && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="notRd">rd</label>
                  <input id="notRd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="notRs1">rs1</label>
                  <input id="notRs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
                </div>
              </div>
            )}

            {opIsLoad && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="loadRd">rd</label>
                  <input id="loadRd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="loadRs1">base rs1</label>
                  <input id="loadRs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="loadImm">imm offset</label>
                  <input id="loadImm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
                </div>
              </div>
            )}

            {opIsStore && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="storeRs2">source rs2</label>
                  <input id="storeRs2" type="number" min={0} max={31} value={rs2} onChange={(event) => setRs2(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="storeRs1">base rs1</label>
                  <input id="storeRs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
                </div>
                <div className="grid">
                  <label htmlFor="storeImm">imm offset</label>
                  <input id="storeImm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
                </div>
              </div>
            )}

            {op === "PRINT" && (
              <div className="row row-3">
                <div className="grid">
                  <label htmlFor="printRs1">Source Register (rs1)</label>
                  <input id="printRs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
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
            <h2>Bit Trace</h2>
            {!trace && <p className="hint">Execute at least one instruction to see bit-level details.</p>}
            {trace && (
              <>
                <div className="traceMeta">
                  <span>
                    <strong>Instruction:</strong> <code>{trace.instruction}</code>
                  </span>
                  <span>
                    <strong>PC:</strong> {trace.pcBefore} -&gt; {trace.pcAfter}
                  </span>
                  {trace.memoryAddresses.length > 0 && (
                    <span>
                      <strong>Memory touched:</strong> {trace.memoryAddresses.map((addr) => toHex32(addr)).join(", ")}
                    </span>
                  )}
                </div>

                {trace.lhsU32 !== undefined && <BinaryRow label="LHS" value={trace.lhsU32} changedBits={[]} />}
                {trace.rhsU32 !== undefined && <BinaryRow label="RHS" value={trace.rhsU32} changedBits={[]} />}
                {trace.resultU32 !== undefined && <BinaryRow label="RESULT" value={trace.resultU32} changedBits={trace.changedBits} />}

                <div className="traceValues">
                  {trace.lhsU32 !== undefined && <span>LHS: {toHex32(trace.lhsU32)}</span>}
                  {trace.rhsU32 !== undefined && <span>RHS: {toHex32(trace.rhsU32)}</span>}
                  {trace.resultU32 !== undefined && <span>RESULT: {toHex32(trace.resultU32)}</span>}
                </div>

                {trace.note && <p className="hint">{trace.note}</p>}
              </>
            )}
          </section>

          <section className="card grid panel">
            <h2>Flags</h2>
            <div className="flagGrid">
              <div className={trace?.flags.z ? "flag on" : "flag"}>Z: {trace?.flags.z ?? 0}</div>
              <div className={trace?.flags.n ? "flag on" : "flag"}>N: {trace?.flags.n ?? 0}</div>
              <div className={trace?.flags.c ? "flag on" : "flag"}>C: {trace?.flags.c ?? 0}</div>
              <div className={trace?.flags.v ? "flag on" : "flag"}>V: {trace?.flags.v ?? 0}</div>
            </div>
          </section>

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
            <div className="memoryHeader">
              <h2>Memory (Data: 0x0400-0x07FF)</h2>
              <div className="memoryWindowInput">
                <label htmlFor="memoryStart">Window Start (dec)</label>
                <input
                  id="memoryStart"
                  type="number"
                  min={DATA_MEM_START}
                  max={DATA_MEM_END - 63}
                  value={memoryWindowStart}
                  onChange={(event) => setMemoryWindowStart(event.target.value)}
                />
              </div>
            </div>
            <p className="hint">Showing 64 bytes ({toHex32(memoryStart)} to {toHex32(memoryStart + 63)}).</p>
            <div className="memoryTable">
              {memoryRows.map((row) => (
                <div key={row.address} className="memoryRow">
                  <div className="memoryAddr">{toHex32(row.address)}</div>
                  <div className="memoryBytes">
                    {row.bytes.map((byte, offset) => {
                      const idx = row.index + offset;
                      return (
                        <span key={idx} className={changedMemorySet.has(idx) ? "memoryByte changed" : "memoryByte"}>
                          {toHex8(byte).slice(2)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="memoryWord">
                    {toHex16((row.bytes[1] ?? 0) << 8 | (row.bytes[0] ?? 0))} {toHex16((row.bytes[3] ?? 0) << 8 | (row.bytes[2] ?? 0))}
                  </div>
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
