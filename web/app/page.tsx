"use client";

import { useMemo, useState } from "react";

type OpCode =
  | "ADD"
  | "ADDI"
  | "SUB"
  | "LUI"
  | "XOR"
  | "XORI"
  | "OR"
  | "ORI"
  | "AND"
  | "ANDI"
  | "SLL"
  | "SRL"
  | "SRA"
  | "LB"
  | "LH"
  | "LW"
  | "LBU"
  | "LHU"
  | "SB"
  | "SH"
  | "SW"
  | "SLT"
  | "SLTI"
  | "SLTU"
  | "SLTIU"
  | "BEQ"
  | "BNE"
  | "BLT"
  | "BLTU"
  | "BGE"
  | "BGEU"
  | "JAL"
  | "JALR";

type OpCategory = "Arithmetic and Logic Operations" | "Memory Access Operations" | "Program Flow Operations";

type GuideItem = {
  op: OpCode;
  category: OpCategory;
  format: string;
  effect: string;
  expected: string;
};

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
  instMem: number[];
  dataMem: number[];
  heapMem: number[];
  heapAllocated: boolean[];
  heapHead: boolean[];
  heapSpan: number[];
  pc: number;
  halted: boolean;
  output: string;
  changedRegisters: number[];
  changedMemoryAddresses: number[];
  lastTrace: StepTrace | null;
};

const REGISTER_COUNT = 32;
const INST_MEM_START = 0x0000;
const INST_MEM_SIZE = 1024;
const INST_MEM_END = INST_MEM_START + INST_MEM_SIZE - 1;
const DATA_MEM_START = 0x0400;
const DATA_MEM_SIZE = 1024;
const DATA_MEM_END = DATA_MEM_START + DATA_MEM_SIZE - 1;
const VR_START = 0x0800;
const VR_END = 0x08ff;
const HEAP_START = 0xb700;
const HEAP_BANK_SIZE = 64;
const HEAP_BANK_COUNT = 128;
const HEAP_SIZE = HEAP_BANK_SIZE * HEAP_BANK_COUNT;
const HEAP_END = HEAP_START + HEAP_SIZE - 1;
const MAX_STEPS = 1000;

const GUIDE_ITEMS: GuideItem[] = [
  { op: "ADD", category: "Arithmetic and Logic Operations", format: "ADD R<rd>, R<rs1>, R<rs2>", effect: "Add two registers.", expected: "R[rd] = R[rs1] + R[rs2]" },
  { op: "ADDI", category: "Arithmetic and Logic Operations", format: "ADDI R<rd>, R<rs1>, <imm>", effect: "Add register and immediate.", expected: "R[rd] = R[rs1] + imm" },
  { op: "SUB", category: "Arithmetic and Logic Operations", format: "SUB R<rd>, R<rs1>, R<rs2>", effect: "Subtract two registers.", expected: "R[rd] = R[rs1] - R[rs2]" },
  { op: "LUI", category: "Arithmetic and Logic Operations", format: "LUI R<rd>, <imm20>", effect: "Load upper immediate.", expected: "R[rd] = imm << 12" },
  { op: "XOR", category: "Arithmetic and Logic Operations", format: "XOR R<rd>, R<rs1>, R<rs2>", effect: "Bitwise XOR.", expected: "R[rd] = R[rs1] ^ R[rs2]" },
  { op: "XORI", category: "Arithmetic and Logic Operations", format: "XORI R<rd>, R<rs1>, <imm>", effect: "Bitwise XOR immediate.", expected: "R[rd] = R[rs1] ^ imm" },
  { op: "OR", category: "Arithmetic and Logic Operations", format: "OR R<rd>, R<rs1>, R<rs2>", effect: "Bitwise OR.", expected: "R[rd] = R[rs1] | R[rs2]" },
  { op: "ORI", category: "Arithmetic and Logic Operations", format: "ORI R<rd>, R<rs1>, <imm>", effect: "Bitwise OR immediate.", expected: "R[rd] = R[rs1] | imm" },
  { op: "AND", category: "Arithmetic and Logic Operations", format: "AND R<rd>, R<rs1>, R<rs2>", effect: "Bitwise AND.", expected: "R[rd] = R[rs1] & R[rs2]" },
  { op: "ANDI", category: "Arithmetic and Logic Operations", format: "ANDI R<rd>, R<rs1>, <imm>", effect: "Bitwise AND immediate.", expected: "R[rd] = R[rs1] & imm" },
  { op: "SLL", category: "Arithmetic and Logic Operations", format: "SLL R<rd>, R<rs1>, R<rs2>", effect: "Logical shift left.", expected: "R[rd] = R[rs1] << (R[rs2] & 31)" },
  { op: "SRL", category: "Arithmetic and Logic Operations", format: "SRL R<rd>, R<rs1>, R<rs2>", effect: "Logical shift right.", expected: "R[rd] = unsigned(R[rs1]) >>> (R[rs2] & 31)" },
  { op: "SRA", category: "Arithmetic and Logic Operations", format: "SRA R<rd>, R<rs1>, R<rs2>", effect: "Arithmetic shift right.", expected: "R[rd] = signed(R[rs1]) >> (R[rs2] & 31)" },
  { op: "LB", category: "Memory Access Operations", format: "LB R<rd>, [R<rs1> + <imm>]", effect: "Load byte and sign-extend.", expected: "R[rd] = sext8(M[address])" },
  { op: "LH", category: "Memory Access Operations", format: "LH R<rd>, [R<rs1> + <imm>]", effect: "Load half word and sign-extend.", expected: "R[rd] = sext16(M[address..+1])" },
  { op: "LW", category: "Memory Access Operations", format: "LW R<rd>, [R<rs1> + <imm>]", effect: "Load word.", expected: "R[rd] = M[address..+3]" },
  { op: "LBU", category: "Memory Access Operations", format: "LBU R<rd>, [R<rs1> + <imm>]", effect: "Load byte unsigned.", expected: "R[rd] = zeroExtend8(M[address])" },
  { op: "LHU", category: "Memory Access Operations", format: "LHU R<rd>, [R<rs1> + <imm>]", effect: "Load half word unsigned.", expected: "R[rd] = zeroExtend16(M[address..+1])" },
  { op: "SB", category: "Memory Access Operations", format: "SB R<rs2>, [R<rs1> + <imm>]", effect: "Store low 8 bits.", expected: "M[address] = R[rs2] & 0xFF" },
  { op: "SH", category: "Memory Access Operations", format: "SH R<rs2>, [R<rs1> + <imm>]", effect: "Store low 16 bits.", expected: "M[address..+1] updated" },
  { op: "SW", category: "Memory Access Operations", format: "SW R<rs2>, [R<rs1> + <imm>]", effect: "Store 32-bit word.", expected: "M[address..+3] updated" },
  { op: "SLT", category: "Program Flow Operations", format: "SLT R<rd>, R<rs1>, R<rs2>", effect: "Set less-than (signed).", expected: "R[rd] = signed(R[rs1]) < signed(R[rs2]) ? 1 : 0" },
  { op: "SLTI", category: "Program Flow Operations", format: "SLTI R<rd>, R<rs1>, <imm>", effect: "Set less-than immediate (signed).", expected: "R[rd] = signed(R[rs1]) < imm ? 1 : 0" },
  { op: "SLTU", category: "Program Flow Operations", format: "SLTU R<rd>, R<rs1>, R<rs2>", effect: "Set less-than (unsigned).", expected: "R[rd] = unsigned(R[rs1]) < unsigned(R[rs2]) ? 1 : 0" },
  { op: "SLTIU", category: "Program Flow Operations", format: "SLTIU R<rd>, R<rs1>, <imm>", effect: "Set less-than immediate (unsigned).", expected: "R[rd] = unsigned(R[rs1]) < unsigned(imm) ? 1 : 0" },
  { op: "BEQ", category: "Program Flow Operations", format: "BEQ R<rs1>, R<rs2>, <imm>", effect: "Branch if equal.", expected: "if equal then PC = PC + (imm << 1)" },
  { op: "BNE", category: "Program Flow Operations", format: "BNE R<rs1>, R<rs2>, <imm>", effect: "Branch if not equal.", expected: "if not equal then PC = PC + (imm << 1)" },
  { op: "BLT", category: "Program Flow Operations", format: "BLT R<rs1>, R<rs2>, <imm>", effect: "Branch if less than (signed).", expected: "if signed(rs1) < signed(rs2) then branch" },
  { op: "BLTU", category: "Program Flow Operations", format: "BLTU R<rs1>, R<rs2>, <imm>", effect: "Branch if less than (unsigned).", expected: "if unsigned(rs1) < unsigned(rs2) then branch" },
  { op: "BGE", category: "Program Flow Operations", format: "BGE R<rs1>, R<rs2>, <imm>", effect: "Branch if greater/equal (signed).", expected: "if signed(rs1) >= signed(rs2) then branch" },
  { op: "BGEU", category: "Program Flow Operations", format: "BGEU R<rs1>, R<rs2>, <imm>", effect: "Branch if greater/equal (unsigned).", expected: "if unsigned(rs1) >= unsigned(rs2) then branch" },
  { op: "JAL", category: "Program Flow Operations", format: "JAL R<rd>, <imm>", effect: "Jump and link.", expected: "R[rd] = PC + 4; PC = PC + (imm << 1)" },
  { op: "JALR", category: "Program Flow Operations", format: "JALR R<rd>, R<rs1>, <imm>", effect: "Jump and link register.", expected: "R[rd] = PC + 4; PC = R[rs1] + imm" }
];

const OP_GROUPS: Array<{ label: OpCategory; ops: OpCode[] }> = [
  {
    label: "Arithmetic and Logic Operations",
    ops: ["ADD", "ADDI", "SUB", "LUI", "XOR", "XORI", "OR", "ORI", "AND", "ANDI", "SLL", "SRL", "SRA"]
  },
  {
    label: "Memory Access Operations",
    ops: ["LB", "LH", "LW", "LBU", "LHU", "SB", "SH", "SW"]
  },
  {
    label: "Program Flow Operations",
    ops: ["SLT", "SLTI", "SLTU", "SLTIU", "BEQ", "BNE", "BLT", "BLTU", "BGE", "BGEU", "JAL", "JALR"]
  }
];

const VIRTUAL_ROUTINES: Array<{ address: string; name: string; access: string; behavior: string }> = [
  { address: "0x0800", name: "Console Write Character", access: "Store", behavior: "Print low 8 bits as ASCII character." },
  { address: "0x0804", name: "Console Write Signed Integer", access: "Store", behavior: "Print value as signed decimal integer." },
  { address: "0x0808", name: "Console Write Unsigned Integer", access: "Store", behavior: "Print value as unsigned lower-case hex." },
  { address: "0x080C", name: "Halt", access: "Store", behavior: "Stop execution and output 'CPU Halt Requested'." },
  { address: "0x0812", name: "Console Read Character", access: "Load", behavior: "Read one character as load result." },
  { address: "0x0816", name: "Console Read Signed Integer", access: "Load", behavior: "Read one signed integer as load result." },
  { address: "0x0820", name: "Dump PC", access: "Store", behavior: "Print current PC in hex." },
  { address: "0x0824", name: "Dump Register Banks", access: "Store", behavior: "Print register dump including PC." },
  { address: "0x0828", name: "Dump Memory Word", access: "Store", behavior: "Treat stored value as address v, print M[v] word in hex." },
  { address: "0x0830", name: "malloc", access: "Store", behavior: "Allocate bytes (stored value), write pointer to R28 (or 0 on failure)." },
  { address: "0x0834", name: "free", access: "Store", behavior: "Free chunk starting at stored pointer, error if invalid." }
];

function createVmState(): VmState {
  return {
    registers: Array.from({ length: REGISTER_COUNT }, () => 0),
    instMem: Array.from({ length: INST_MEM_SIZE }, () => 0),
    dataMem: Array.from({ length: DATA_MEM_SIZE }, () => 0),
    heapMem: Array.from({ length: HEAP_SIZE }, () => 0),
    heapAllocated: Array.from({ length: HEAP_BANK_COUNT }, () => false),
    heapHead: Array.from({ length: HEAP_BANK_COUNT }, () => false),
    heapSpan: Array.from({ length: HEAP_BANK_COUNT }, () => 0),
    pc: 0,
    halted: false,
    output: "",
    changedRegisters: [],
    changedMemoryAddresses: [],
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
    case "LUI":
      return `LUI R${instruction.rd}, ${instruction.imm}`;
    case "ADDI":
    case "XORI":
    case "ORI":
    case "ANDI":
    case "SLTI":
    case "SLTIU":
      return `${instruction.op} R${instruction.rd}, R${instruction.rs1}, ${instruction.imm}`;
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
    case "BEQ":
    case "BNE":
    case "BLT":
    case "BLTU":
    case "BGE":
    case "BGEU":
      return `${instruction.op} R${instruction.rs1}, R${instruction.rs2}, ${instruction.imm}`;
    case "JAL":
      return `JAL R${instruction.rd}, ${instruction.imm}`;
    case "JALR":
      return `JALR R${instruction.rd}, R${instruction.rs1}, ${instruction.imm}`;
    default:
      return `${instruction.op} R${instruction.rd}, R${instruction.rs1}, R${instruction.rs2}`;
  }
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

function executeInstruction(state: VmState, instruction: Instruction, programLength: number): VmState {
  if (state.halted || state.pc >= programLength) {
    return {
      ...state,
      halted: true,
      changedRegisters: [],
      changedMemoryAddresses: []
    };
  }

  const next: VmState = {
    ...state,
    registers: [...state.registers],
    instMem: [...state.instMem],
    dataMem: [...state.dataMem],
    heapMem: [...state.heapMem],
    heapAllocated: [...state.heapAllocated],
    heapHead: [...state.heapHead],
    heapSpan: [...state.heapSpan],
    changedRegisters: [],
    changedMemoryAddresses: [],
    lastTrace: {
      pcBefore: state.pc,
      pcAfter: state.pc,
      instruction: renderInstruction(instruction),
      changedBits: [],
      flags: { z: 0, n: 0, c: 0, v: 0 },
      memoryAddresses: []
    }
  };

  const pcBytesBefore = state.pc * 4;
  let nextPc = state.pc + 1;

  const appendOutput = (text: string) => {
    next.output += text;
  };

  const stopIllegal = (text: string) => {
    next.halted = true;
    appendOutput(`${text}\n`);
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

  const touchAddress = (address: number) => {
    if (!next.changedMemoryAddresses.includes(address)) {
      next.changedMemoryAddresses.push(address);
    }
    if (next.lastTrace && !next.lastTrace.memoryAddresses.includes(address)) {
      next.lastTrace.memoryAddresses.push(address);
    }
  };

  const setReg = (index: number, value: number) => {
    if (index === 0) {
      return;
    }
    next.registers[index] = toInt32(value);
    if (!next.changedRegisters.includes(index)) {
      next.changedRegisters.push(index);
    }
  };

  const readByte = (address: number): number | null => {
    if (address >= INST_MEM_START && address <= INST_MEM_END) {
      return next.instMem[address - INST_MEM_START] ?? 0;
    }
    if (address >= DATA_MEM_START && address <= DATA_MEM_END) {
      return next.dataMem[address - DATA_MEM_START] ?? 0;
    }
    if (address >= HEAP_START && address <= HEAP_END) {
      const offset = address - HEAP_START;
      const bank = Math.floor(offset / HEAP_BANK_SIZE);
      if (!next.heapAllocated[bank]) {
        stopIllegal(`Illegal Operation: read from unallocated heap address ${toHex32(address)}`);
        return null;
      }
      return next.heapMem[offset] ?? 0;
    }
    stopIllegal(`Illegal Operation: read from invalid memory address ${toHex32(address)}`);
    return null;
  };

  const writeByte = (address: number, value: number): boolean => {
    const byte = value & 0xff;
    if (address >= DATA_MEM_START && address <= DATA_MEM_END) {
      const idx = address - DATA_MEM_START;
      if (next.dataMem[idx] !== byte) {
        next.dataMem[idx] = byte;
        touchAddress(address);
      }
      return true;
    }
    if (address >= HEAP_START && address <= HEAP_END) {
      const offset = address - HEAP_START;
      const bank = Math.floor(offset / HEAP_BANK_SIZE);
      if (!next.heapAllocated[bank]) {
        stopIllegal(`Illegal Operation: write to unallocated heap address ${toHex32(address)}`);
        return false;
      }
      if (next.heapMem[offset] !== byte) {
        next.heapMem[offset] = byte;
        touchAddress(address);
      }
      return true;
    }
    stopIllegal(`Illegal Operation: write to invalid memory address ${toHex32(address)}`);
    return false;
  };

  const readWordAt = (address: number): number | null => {
    const b0 = readByte(address);
    if (b0 === null) {
      return null;
    }
    const b1 = readByte(address + 1);
    if (b1 === null) {
      return null;
    }
    const b2 = readByte(address + 2);
    if (b2 === null) {
      return null;
    }
    const b3 = readByte(address + 3);
    if (b3 === null) {
      return null;
    }
    return toInt32((b3 << 24) | (b2 << 16) | (b1 << 8) | b0);
  };

  const mallocBanks = (bytesRaw: number) => {
    const bytes = toU32(bytesRaw);
    let banksNeeded = Math.ceil(bytes / HEAP_BANK_SIZE);
    if (banksNeeded === 0) {
      banksNeeded = 1;
    }
    if (banksNeeded > HEAP_BANK_COUNT) {
      setReg(28, 0);
      return;
    }
    let start = -1;
    for (let i = 0; i <= HEAP_BANK_COUNT - banksNeeded; i += 1) {
      let ok = true;
      for (let j = 0; j < banksNeeded; j += 1) {
        if (next.heapAllocated[i + j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      setReg(28, 0);
      return;
    }
    for (let j = 0; j < banksNeeded; j += 1) {
      next.heapAllocated[start + j] = true;
      next.heapHead[start + j] = j === 0;
      next.heapSpan[start + j] = j === 0 ? banksNeeded : 0;
    }
    setReg(28, HEAP_START + start * HEAP_BANK_SIZE);
  };

  const freeBanks = (ptrRaw: number): boolean => {
    const ptr = toU32(ptrRaw);
    if (ptr < HEAP_START || ptr > HEAP_END || (ptr - HEAP_START) % HEAP_BANK_SIZE !== 0) {
      stopIllegal(`Illegal Operation: invalid free pointer ${toHex32(ptr)}`);
      return false;
    }
    const bank = Math.floor((ptr - HEAP_START) / HEAP_BANK_SIZE);
    if (!next.heapAllocated[bank] || !next.heapHead[bank]) {
      stopIllegal(`Illegal Operation: free on non-head/unallocated pointer ${toHex32(ptr)}`);
      return false;
    }
    const span = next.heapSpan[bank];
    for (let i = 0; i < span; i += 1) {
      const b = bank + i;
      next.heapAllocated[b] = false;
      next.heapHead[b] = false;
      next.heapSpan[b] = 0;
      const base = b * HEAP_BANK_SIZE;
      for (let j = 0; j < HEAP_BANK_SIZE; j += 1) {
        next.heapMem[base + j] = 0;
      }
    }
    return true;
  };

  const applyPcBytes = (targetBytes: number): boolean => {
    if (targetBytes % 4 !== 0) {
      stopIllegal(`Illegal Operation: unaligned PC target ${toHex32(targetBytes)}`);
      return false;
    }
    const targetIndex = targetBytes / 4;
    if (targetIndex < 0 || targetIndex > programLength) {
      stopIllegal(`Illegal Operation: PC target out of range ${toHex32(targetBytes)}`);
      return false;
    }
    nextPc = targetIndex;
    return true;
  };

  const handleLoad = (dst: number, address: number, op: "LB" | "LH" | "LW" | "LBU" | "LHU", rs1Value: number, immValue: number) => {
    if (address >= VR_START && address <= VR_END) {
      if (address === 0x0812) {
        const text = typeof window !== "undefined" ? window.prompt("Console Read Character (0x0812): input one character", "") ?? "" : "";
        const charCode = text.length > 0 ? text.charCodeAt(0) : 0;
        const before = next.registers[dst] ?? 0;
        setReg(dst, charCode);
        finishAluTrace({ lhs: rs1Value, rhs: immValue, result: charCode, destBefore: before, flags: flagsFromResult(toU32(charCode)), note: "VR 0x0812 read character" });
        return;
      }
      if (address === 0x0816) {
        const text = typeof window !== "undefined" ? window.prompt("Console Read Signed Integer (0x0816)", "0") ?? "0" : "0";
        const num = Number.parseInt(text, 10);
        const value = Number.isNaN(num) ? 0 : toInt32(num);
        const before = next.registers[dst] ?? 0;
        setReg(dst, value);
        finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, destBefore: before, flags: flagsFromResult(toU32(value)), note: "VR 0x0816 read signed integer" });
        return;
      }
      stopIllegal(`Illegal Operation: unsupported VR load ${toHex32(address)}`);
      finishAluTrace({ lhs: rs1Value, rhs: immValue, note: "Memory load failed." });
      return;
    }

    const b0 = readByte(address);
    if (b0 === null) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, note: "Memory load failed." });
      return;
    }
    const b1 = op === "LB" || op === "LBU" ? 0 : readByte(address + 1);
    if ((op === "LH" || op === "LHU" || op === "LW") && b1 === null) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, note: "Memory load failed." });
      return;
    }
    const b2 = op === "LW" ? readByte(address + 2) : 0;
    if (op === "LW" && b2 === null) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, note: "Memory load failed." });
      return;
    }
    const b3 = op === "LW" ? readByte(address + 3) : 0;
    if (op === "LW" && b3 === null) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, note: "Memory load failed." });
      return;
    }

    let loaded = 0;
    if (op === "LB") {
      loaded = signExtend8(b0);
    } else if (op === "LBU") {
      loaded = b0;
    } else if (op === "LH") {
      loaded = signExtend16(((b1 as number) << 8) | b0);
    } else if (op === "LHU") {
      loaded = ((b1 as number) << 8) | b0;
    } else {
      loaded = toInt32(((b3 as number) << 24) | ((b2 as number) << 16) | ((b1 as number) << 8) | b0);
    }

    const before = next.registers[dst] ?? 0;
    setReg(dst, loaded);
    finishAluTrace({
      lhs: rs1Value,
      rhs: immValue,
      result: loaded,
      destBefore: before,
      flags: flagsFromResult(toU32(loaded)),
      note: `${op} from ${toHex32(address)}`
    });
  };

  const handleStore = (src: number, address: number, width: 1 | 2 | 4, rs1Value: number, immValue: number, op: "SB" | "SH" | "SW") => {
    const value = next.registers[src] ?? 0;

    if (address >= VR_START && address <= VR_END) {
      const u = toU32(value);
      if (address === 0x0800) {
        appendOutput(String.fromCharCode(u & 0xff));
      } else if (address === 0x0804) {
        appendOutput(`${toInt32(u)}`);
      } else if (address === 0x0808) {
        appendOutput(`${u.toString(16)}`);
      } else if (address === 0x080c) {
        appendOutput("CPU Halt Requested\n");
        next.halted = true;
      } else if (address === 0x0820) {
        appendOutput(`${toHex32(pcBytesBefore)}\n`);
      } else if (address === 0x0824) {
        appendOutput(`PC = ${toHex32(pcBytesBefore)};\n`);
        for (let i = 0; i < REGISTER_COUNT; i += 1) {
          appendOutput(`R[${i}] = ${toHex32(next.registers[i])};\n`);
        }
      } else if (address === 0x0828) {
        const word = readWordAt(u);
        if (word === null) {
          finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
          return;
        }
        appendOutput(`${toU32(word).toString(16)}`);
      } else if (address === 0x0830) {
        mallocBanks(u);
      } else if (address === 0x0834) {
        if (!freeBanks(u)) {
          finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
          return;
        }
      } else {
        stopIllegal(`Illegal Operation: unsupported VR store ${toHex32(address)}`);
        finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
        return;
      }
      finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, flags: flagsFromResult(toU32(value)), note: `${op} to VR ${toHex32(address)}` });
      return;
    }

    if (!writeByte(address, value)) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
      return;
    }
    if (width >= 2 && !writeByte(address + 1, value >>> 8)) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
      return;
    }
    if (width === 4 && (!writeByte(address + 2, value >>> 16) || !writeByte(address + 3, value >>> 24))) {
      finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, note: "Memory store failed." });
      return;
    }

    finishAluTrace({ lhs: rs1Value, rhs: immValue, result: value, flags: flagsFromResult(toU32(value)), note: `${op} to ${toHex32(address)}` });
  };

  switch (instruction.op) {
    case "ADD": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const calc = add32(lhs, rhs);
      setReg(dst, calc.result);
      finishAluTrace({ lhs, rhs, result: calc.result, destBefore: before, flags: flagsFromResult(calc.result, calc.c, calc.v) });
      break;
    }
    case "ADDI": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const calc = add32(lhs, rhs);
      setReg(dst, calc.result);
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
      finishAluTrace({ lhs, rhs, result: calc.result, destBefore: before, flags: flagsFromResult(calc.result, calc.c, calc.v) });
      break;
    }
    case "LUI": {
      const dst = instruction.rd ?? 0;
      const imm = instruction.imm ?? 0;
      const result = toInt32(imm << 12);
      const before = next.registers[dst] ?? 0;
      setReg(dst, result);
      finishAluTrace({ lhs: imm, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "XOR": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) ^ toU32(rhs);
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "XORI": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) ^ toU32(rhs);
      setReg(dst, result);
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
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "ORI": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) | toU32(rhs);
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "AND": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) & toU32(rhs);
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "ANDI": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) & toU32(rhs);
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SLL": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) << shamt;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "SRL": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) >>> shamt;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SRA": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const shamt = toU32(rhs) & 31;
      const before = next.registers[dst] ?? 0;
      const result = toInt32(lhs) >> shamt;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs: shamt, result, destBefore: before, flags: flagsFromResult(toU32(result)) });
      break;
    }
    case "SLT": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toInt32(lhs) < toInt32(rhs) ? 1 : 0;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SLTI": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toInt32(lhs) < toInt32(rhs) ? 1 : 0;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SLTU": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) < toU32(rhs) ? 1 : 0;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
      break;
    }
    case "SLTIU": {
      const dst = instruction.rd ?? 0;
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const result = toU32(lhs) < toU32(rhs) ? 1 : 0;
      setReg(dst, result);
      finishAluTrace({ lhs, rhs, result, destBefore: before, flags: flagsFromResult(result) });
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
      const base = next.registers[rs1] ?? 0;
      const address = toU32(toInt32(base + imm));
      handleLoad(dst, address, instruction.op, base, imm);
      break;
    }
    case "SB":
    case "SH":
    case "SW": {
      const rs2 = instruction.rs2 ?? 0;
      const rs1 = instruction.rs1 ?? 0;
      const imm = instruction.imm ?? 0;
      const base = next.registers[rs1] ?? 0;
      const address = toU32(toInt32(base + imm));
      const width: 1 | 2 | 4 = instruction.op === "SB" ? 1 : instruction.op === "SH" ? 2 : 4;
      handleStore(rs2, address, width, base, imm, instruction.op);
      break;
    }
    case "BEQ":
    case "BNE":
    case "BLT":
    case "BLTU":
    case "BGE":
    case "BGEU": {
      const lhs = next.registers[instruction.rs1 ?? 0] ?? 0;
      const rhs = next.registers[instruction.rs2 ?? 0] ?? 0;
      const imm = instruction.imm ?? 0;
      let take = false;
      if (instruction.op === "BEQ") {
        take = toInt32(lhs) === toInt32(rhs);
      } else if (instruction.op === "BNE") {
        take = toInt32(lhs) !== toInt32(rhs);
      } else if (instruction.op === "BLT") {
        take = toInt32(lhs) < toInt32(rhs);
      } else if (instruction.op === "BLTU") {
        take = toU32(lhs) < toU32(rhs);
      } else if (instruction.op === "BGE") {
        take = toInt32(lhs) >= toInt32(rhs);
      } else {
        take = toU32(lhs) >= toU32(rhs);
      }
      if (take) {
        applyPcBytes(pcBytesBefore + (imm << 1));
      }
      finishAluTrace({ lhs, rhs, result: take ? 1 : 0, flags: flagsFromResult(take ? 1 : 0), note: take ? "Branch taken" : "Branch not taken" });
      break;
    }
    case "JAL": {
      const dst = instruction.rd ?? 0;
      const imm = instruction.imm ?? 0;
      const before = next.registers[dst] ?? 0;
      const ret = pcBytesBefore + 4;
      setReg(dst, ret);
      applyPcBytes(pcBytesBefore + (imm << 1));
      finishAluTrace({ lhs: pcBytesBefore, rhs: imm, result: ret, destBefore: before, flags: flagsFromResult(toU32(ret)), note: "JAL" });
      break;
    }
    case "JALR": {
      const dst = instruction.rd ?? 0;
      const rs1 = instruction.rs1 ?? 0;
      const imm = instruction.imm ?? 0;
      const base = next.registers[rs1] ?? 0;
      const before = next.registers[dst] ?? 0;
      const ret = pcBytesBefore + 4;
      const target = toU32(toInt32(base + imm));
      setReg(dst, ret);
      applyPcBytes(target);
      finishAluTrace({ lhs: base, rhs: imm, result: ret, destBefore: before, flags: flagsFromResult(toU32(ret)), note: "JALR" });
      break;
    }
    default:
      stopIllegal("Runtime error: unsupported instruction.");
      finishAluTrace({ note: "Unsupported instruction." });
      break;
  }

  next.registers[0] = 0;

  if (!next.halted) {
    next.pc = nextPc;
  }

  if (next.lastTrace) {
    next.lastTrace.pcAfter = next.pc;
  }

  if (next.pc >= programLength && !next.halted) {
    next.halted = true;
    appendOutput("Program finished.\n");
  }

  return next;
}

export default function HomePage() {
  const [program, setProgram] = useState<Instruction[]>([]);
  const [vmState, setVmState] = useState<VmState>(() => createVmState());
  const [op, setOp] = useState<OpCode>("ADD");
  const [rd, setRd] = useState("1");
  const [rs1, setRs1] = useState("1");
  const [rs2, setRs2] = useState("2");
  const [imm, setImm] = useState("0");
  const [dataWindowStart, setDataWindowStart] = useState("1024");
  const [heapWindowStart, setHeapWindowStart] = useState(String(HEAP_START));

  const canStep = program.length > 0 && !vmState.halted;

  const pcInstruction = useMemo(() => {
    if (vmState.pc < 0 || vmState.pc >= program.length) {
      return null;
    }
    return program[vmState.pc];
  }, [program, vmState.pc]);

  const dataStart = useMemo(() => {
    const raw = parseNumber(dataWindowStart);
    return Math.max(DATA_MEM_START, Math.min(DATA_MEM_END - 63, raw));
  }, [dataWindowStart]);

  const heapStart = useMemo(() => {
    const raw = parseNumber(heapWindowStart);
    return Math.max(HEAP_START, Math.min(HEAP_END - 63, raw));
  }, [heapWindowStart]);

  const dataRows = useMemo(() => {
    const rows: Array<{ address: number; bytes: number[] }> = [];
    for (let row = 0; row < 8; row += 1) {
      const address = dataStart + row * 8;
      const baseIndex = address - DATA_MEM_START;
      rows.push({ address, bytes: vmState.dataMem.slice(baseIndex, baseIndex + 8) });
    }
    return rows;
  }, [dataStart, vmState.dataMem]);

  const heapRows = useMemo(() => {
    const rows: Array<{ address: number; bytes: number[] }> = [];
    for (let row = 0; row < 8; row += 1) {
      const address = heapStart + row * 8;
      const baseIndex = address - HEAP_START;
      rows.push({ address, bytes: vmState.heapMem.slice(baseIndex, baseIndex + 8) });
    }
    return rows;
  }, [heapStart, vmState.heapMem]);

  const changedMemorySet = useMemo(() => new Set(vmState.changedMemoryAddresses), [vmState.changedMemoryAddresses]);
  const heapAllocMap = useMemo(() => vmState.heapAllocated.map((v, i) => ({ idx: i, allocated: v, head: vmState.heapHead[i], span: vmState.heapSpan[i] })), [vmState.heapAllocated, vmState.heapHead, vmState.heapSpan]);

  const opIsR3 = ["ADD", "SUB", "XOR", "OR", "AND", "SLL", "SRL", "SRA", "SLT", "SLTU"].includes(op);
  const opIsIArith = ["ADDI", "XORI", "ORI", "ANDI", "SLTI", "SLTIU"].includes(op);
  const opIsLoad = ["LB", "LH", "LW", "LBU", "LHU"].includes(op);
  const opIsStore = ["SB", "SH", "SW"].includes(op);
  const opIsBranch = ["BEQ", "BNE", "BLT", "BLTU", "BGE", "BGEU"].includes(op);

  function addInstruction() {
    const next: Instruction = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      op
    };

    if (op === "LUI") {
      next.rd = parseRegister(rd);
      next.imm = parseNumber(imm);
    } else if (opIsR3) {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
      next.rs2 = parseRegister(rs2);
    } else if (opIsIArith || opIsLoad) {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
      next.imm = parseNumber(imm);
    } else if (opIsStore || opIsBranch) {
      next.rs2 = parseRegister(rs2);
      next.rs1 = parseRegister(rs1);
      next.imm = parseNumber(imm);
    } else if (op === "JAL") {
      next.rd = parseRegister(rd);
      next.imm = parseNumber(imm);
    } else if (op === "JALR") {
      next.rd = parseRegister(rd);
      next.rs1 = parseRegister(rs1);
      next.imm = parseNumber(imm);
    }

    setProgram((prev) => [...prev, next]);
  }

  function removeInstruction(id: string) {
    setProgram((prev) => prev.filter((inst) => inst.id !== id));
    setVmState((prev) => {
      const reset = createVmState();
      return { ...reset, output: `${prev.output}Program changed. VM reset required.\n` };
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
          output: `${prev.output}Program finished.\n`,
          changedRegisters: [],
          changedMemoryAddresses: []
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
        output: `${current.output}Execution stopped after ${MAX_STEPS} steps for safety.\n`
      };
    }
    setVmState(current);
  }

  const trace = vmState.lastTrace;

  return (
    <main>
      <h1>RISK-XVII Online Lab</h1>
      <p className="subtitle">A VM supporting full instruction flow, PC execution, virtual routines, and heap banks.</p>
      <p className="subtitle contactLinks">
        Please contact:{" "}
        <a className="contactLink" href="https://github.com/RobinWu98" target="_blank" rel="noreferrer">
          <span className="contactIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                fill="currentColor"
                d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.1 3.3 9.43 7.88 10.96.58.11.79-.25.79-.56v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.04 1.77 2.72 1.26 3.39.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.5.11-3.13 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 5.82 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.63.23 2.83.11 3.13.74.8 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.27 5.69.41.36.78 1.08.78 2.17v3.22c0 .31.21.68.8.56A11.55 11.55 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z"
              />
            </svg>
          </span>
          GitHub
        </a>
        <a className="contactLink" href="https://www.linkedin.com/in/shangwei-wu-a74a61263/" target="_blank" rel="noreferrer">
          <span className="contactIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                fill="currentColor"
                d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.05-1.86-3.05-1.86 0-2.15 1.45-2.15 2.95v5.67H9.32V9h3.42v1.56h.05c.47-.9 1.64-1.86 3.37-1.86 3.6 0 4.26 2.36 4.26 5.43v6.32ZM5.3 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13Zm1.78 13.02H3.52V9h3.56v11.45ZM22.23 0H1.77A1.77 1.77 0 0 0 0 1.77v20.46C0 23.2.8 24 1.77 24h20.46A1.77 1.77 0 0 0 24 22.23V1.77A1.77 1.77 0 0 0 22.23 0Z"
              />
            </svg>
          </span>
          LinkedIn
        </a>
        <a className="contactLink" href="mailto:shangweiwu1013@gmail.com">
          <span className="contactIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                fill="currentColor"
                d="M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.24-8 4.99-8-5V6l8 5 8-5v2.24Z"
              />
            </svg>
          </span>
          Email
        </a>
      </p>

      <section className="card usageGuide">
        <h2>Usage Guide</h2>
        <ol>
          <li>Select an operation in the builder panel and fill operands as shown.</li>
          <li>For memory ops, address = `R[rs1] + imm`.</li>
          <li>Click `Add Instruction` to build your program.</li>
          <li>Use `Step` for single-cycle execution, or `Run` for continuous execution.</li>
          <li>PC is shown in instruction index and byte address (`PC*4`) forms.</li>
          <li>Use virtual routine addresses (`0x0800` etc.) via load/store operations.</li>
          <li>Use heap virtual routines at `0x0830` (malloc) and `0x0834` (free); allocated pointer returns in `R28`.</li>
        </ol>
      </section>

      <section className="card guideDetails panel">
        <details>
          <summary>Instruction Guide (All RISK-XVII Instructions, Expand/Collapse)</summary>
          <div className="guideTableWrap">
            <table className="guideTable">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Op</th>
                  <th>Input Format</th>
                  <th>Action</th>
                  <th>Expected Result</th>
                </tr>
              </thead>
              <tbody>
                {GUIDE_ITEMS.map((item) => (
                  <tr key={item.op}>
                    <td>{item.category}</td>
                    <td><code>{item.op}</code></td>
                    <td><code>{item.format}</code></td>
                    <td>{item.effect}</td>
                    <td>{item.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="card guideDetails panel">
        <details>
          <summary>PC / Memory / Heap Explanation (Expand/Collapse)</summary>
          <div className="guideTableWrap">
            <table className="guideTable">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Definition</th>
                  <th>How to Use</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>PC (Program Counter)</td>
                  <td>PC points to current instruction address in bytes. In this UI, `instruction index = PC / 4`.</td>
                  <td>Normal execution: `PC += 4`. Branch/JAL/JALR can change PC based on immediate/register rules.</td>
                </tr>
                <tr>
                  <td>Instruction Memory</td>
                  <td>`0x0000 - 0x03FF` (1024 bytes).</td>
                  <td>Loads can read from this region. Stores to this region are illegal operations.</td>
                </tr>
                <tr>
                  <td>Data Memory</td>
                  <td>`0x0400 - 0x07FF` (1024 bytes).</td>
                  <td>General load/store for data and stack-like usage.</td>
                </tr>
                <tr>
                  <td>Virtual Routines</td>
                  <td>`0x0800 - 0x08FF` mapped to I/O and diagnostics routines.</td>
                  <td>Use `SB/SH/SW` for write routines and `LB/LH/LW/LBU/LHU` for read routines (`0x0812`, `0x0816`).</td>
                </tr>
                <tr>
                  <td>Heap Banks</td>
                  <td>`0xB700 - 0xD6FF`, 128 banks × 64 bytes (8192 bytes total).</td>
                  <td>Store to `0x0830` to malloc (size from source register, result in `R28`); store to `0x0834` to free.</td>
                </tr>
                <tr>
                  <td>Illegal Operation</td>
                  <td>Out-of-bound memory access, invalid VR usage, or access to unallocated/freed heap memory.</td>
                  <td>VM stops and reports error in output panel.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3>Virtual Routines</h3>
          <div className="guideTableWrap">
            <table className="guideTable">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Name</th>
                  <th>Access</th>
                  <th>Behavior</th>
                </tr>
              </thead>
              <tbody>
                {VIRTUAL_ROUTINES.map((vr) => (
                  <tr key={vr.address}>
                    <td><code>{vr.address}</code></td>
                    <td>{vr.name}</td>
                    <td>{vr.access}</td>
                    <td>{vr.behavior}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="workspaceVertical">
        <section className="card grid panel">
          <h2>Instruction Builder</h2>

          <div className="row">
            <label htmlFor="op">Operation</label>
            <select id="op" value={op} onChange={(event) => setOp(event.target.value as OpCode)}>
              {OP_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.ops.map((opName) => (
                    <option key={opName} value={opName}>{opName}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {(opIsR3 || op === "JALR") && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="rd">rd</label>
                <input id="rd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="rs1">rs1</label>
                <input id="rs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
              </div>
              {opIsR3 && (
                <div className="grid">
                  <label htmlFor="rs2">rs2</label>
                  <input id="rs2" type="number" min={0} max={31} value={rs2} onChange={(event) => setRs2(event.target.value)} />
                </div>
              )}
              {op === "JALR" && (
                <div className="grid">
                  <label htmlFor="immJalr">imm</label>
                  <input id="immJalr" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
                </div>
              )}
            </div>
          )}

          {(opIsIArith || opIsLoad) && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="ird">rd</label>
                <input id="ird" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="irs1">rs1</label>
                <input id="irs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="iimm">imm</label>
                <input id="iimm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
              </div>
            </div>
          )}

          {opIsStore && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="srs2">source rs2</label>
                <input id="srs2" type="number" min={0} max={31} value={rs2} onChange={(event) => setRs2(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="srs1">base rs1</label>
                <input id="srs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="simm">imm</label>
                <input id="simm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
              </div>
            </div>
          )}

          {opIsBranch && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="brs1">rs1</label>
                <input id="brs1" type="number" min={0} max={31} value={rs1} onChange={(event) => setRs1(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="brs2">rs2</label>
                <input id="brs2" type="number" min={0} max={31} value={rs2} onChange={(event) => setRs2(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="bimm">imm (branch uses imm &lt;&lt; 1)</label>
                <input id="bimm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
              </div>
            </div>
          )}

          {op === "LUI" && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="lrd">rd</label>
                <input id="lrd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="limm">imm20</label>
                <input id="limm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
              </div>
            </div>
          )}

          {op === "JAL" && (
            <div className="row row-3">
              <div className="grid">
                <label htmlFor="jrd">rd</label>
                <input id="jrd" type="number" min={0} max={31} value={rd} onChange={(event) => setRd(event.target.value)} />
              </div>
              <div className="grid">
                <label htmlFor="jimm">imm (jump uses imm &lt;&lt; 1)</label>
                <input id="jimm" type="number" value={imm} onChange={(event) => setImm(event.target.value)} />
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
            PC(index): {vmState.pc} | PC(byte): {toHex32(vmState.pc * 4)} {pcInstruction ? `| Next: ${renderInstruction(pcInstruction)}` : "| Program complete"}
          </p>
        </section>

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
                  <strong>PC index:</strong> {trace.pcBefore} -&gt; {trace.pcAfter} | <strong>PC byte:</strong> {toHex32(trace.pcBefore * 4)} -&gt; {toHex32(trace.pcAfter * 4)}
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
            <h2>Data Memory (0x0400-0x07FF)</h2>
            <div className="memoryWindowInput">
              <label htmlFor="dataStart">Window Start (dec)</label>
              <input id="dataStart" type="number" min={DATA_MEM_START} max={DATA_MEM_END - 63} value={dataWindowStart} onChange={(event) => setDataWindowStart(event.target.value)} />
            </div>
          </div>
          <p className="hint">Showing 64 bytes ({toHex32(dataStart)} to {toHex32(dataStart + 63)}).</p>
          <div className="memoryTable">
            {dataRows.map((row) => (
              <div key={row.address} className="memoryRow">
                <div className="memoryAddr">{toHex32(row.address)}</div>
                <div className="memoryBytes">
                  {row.bytes.map((byte, offset) => {
                    const addr = row.address + offset;
                    return (
                      <span key={addr} className={changedMemorySet.has(addr) ? "memoryByte changed" : "memoryByte"}>
                        {toHex8(byte).slice(2)}
                      </span>
                    );
                  })}
                </div>
                <div className="memoryWord">
                  {toHex16(((row.bytes[1] ?? 0) << 8) | (row.bytes[0] ?? 0))} {toHex16(((row.bytes[3] ?? 0) << 8) | (row.bytes[2] ?? 0))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card grid panel">
          <div className="memoryHeader">
            <h2>Heap Memory (0xB700-0xD6FF)</h2>
            <div className="memoryWindowInput">
              <label htmlFor="heapStart">Window Start (dec)</label>
              <input id="heapStart" type="number" min={HEAP_START} max={HEAP_END - 63} value={heapWindowStart} onChange={(event) => setHeapWindowStart(event.target.value)} />
            </div>
          </div>
          <p className="hint">Showing 64 bytes ({toHex32(heapStart)} to {toHex32(heapStart + 63)}).</p>
          <div className="memoryTable">
            {heapRows.map((row) => (
              <div key={row.address} className="memoryRow">
                <div className="memoryAddr">{toHex32(row.address)}</div>
                <div className="memoryBytes">
                  {row.bytes.map((byte, offset) => {
                    const addr = row.address + offset;
                    return (
                      <span key={addr} className={changedMemorySet.has(addr) ? "memoryByte changed" : "memoryByte"}>
                        {toHex8(byte).slice(2)}
                      </span>
                    );
                  })}
                </div>
                <div className="memoryWord">
                  {toHex16(((row.bytes[1] ?? 0) << 8) | (row.bytes[0] ?? 0))} {toHex16(((row.bytes[3] ?? 0) << 8) | (row.bytes[2] ?? 0))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card grid panel">
          <h2>Heap Banks Allocation (128 x 64B)</h2>
          <div className="registerGrid">
            {heapAllocMap.map((bank) => (
              <div key={bank.idx} className={bank.allocated ? "register changed" : "register"}>
                <strong>B{bank.idx}</strong>
                <span>{bank.allocated ? (bank.head ? `HEAD x${bank.span}` : "ALLOC") : "FREE"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card grid panel">
          <h2>Output</h2>
          <section className="output" aria-live="polite">
            {vmState.output.length === 0 ? "Output will appear here." : vmState.output}
          </section>
        </section>
      </section>
    </main>
  );
}
