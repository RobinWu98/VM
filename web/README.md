# RISK-XVII Online Lab (Next.js)

This is a Next.js frontend for interactive VM learning, plus an API wrapper around the existing `vm_riskxvii` C binary.

## What it does

- Build a small instruction program directly in the browser (no `.mi` upload required).
- Execute the program step-by-step (`Step`) or continuously (`Run`).
- Watch register updates and PC movement after each instruction.
- Inspect output logs from virtual routines (console write / dump / halt) and runtime errors.
- Still supports `/api/run` for `.mi` execution through backend API.

## ISA coverage 

The web simulator now follows the assignment instruction set categories:

- Arithmetic and Logic Operations:
  `add addi sub lui xor xori or ori and andi sll srl sra`
- Memory Access Operations:
  `lb lh lw lbu lhu sb sh sw`
- Program Flow Operations:
  `slt slti sltu sltiu beq bne blt bltu bge bgeu jal jalr`

## PC and memory model

- PC is tracked in instruction index and byte address (`PC = index * 4`).
- Normal execution increments PC by 4 bytes.
- Branch/jump instructions update PC according to the spec formulas.
- Memory map:
  - `0x0000 - 0x03FF`: Instruction memory
  - `0x0400 - 0x07FF`: Data memory
  - `0x0800 - 0x08FF`: Virtual routines
  - `0xB700 - 0xD6FF`: Heap banks (128 x 64 bytes)

## Virtual routines and heap

- Implemented virtual routine addresses:
  - `0x0800` write char
  - `0x0804` write signed int
  - `0x0808` write unsigned hex
  - `0x080C` halt
  - `0x0812` read char
  - `0x0816` read signed int
  - `0x0820` dump PC
  - `0x0824` dump register banks
  - `0x0828` dump memory word
  - `0x0830` malloc (result in `R28`)
  - `0x0834` free

- Heap allocation is tracked in 128 banks; malloc requires consecutive free banks and free validates head pointers.

## Local run

From project root:

```bash
make
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## API contract

`POST /api/run` as `multipart/form-data`:

- `program`: `.mi` file
- `stdin`: optional text input

Response:

```json
{
  "code": 1,
  "output": "46CPU Halt Requested"
}
```

## Deployment notes

This project depends on a native executable (`cli/vm_riskxvii`).

- If deploying to serverless platforms, ensure native binary execution is supported.
- For stable deployment, use a container platform (Render, Fly.io, Railway, ECS, etc.) and compile `vm_riskxvii` during build.

Example Docker build steps:

1. Install build tools (`gcc`, `make`).
2. Run `make` at repository root.
3. Run `npm ci && npm run build` in `web/`.
4. Start with `npm run start`.
