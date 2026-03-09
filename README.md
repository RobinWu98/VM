# RISK-XVII VM

A virtual machine project for the RISK-XVII ISA, with:

- a **Web simulator** (interactive UI, step/run execution, trace panels), and
- a **C CLI VM** (`vm_riskxvii.c`) for binary memory image execution.

Welcome to use it.

## Feature Blocks

This project supports the following VM capability blocks:

- **Instruction execution core**
  - Arithmetic & logic block
  - Memory access block
  - Program flow block (branch/jump)
- **Execution observability**
  - Program builder + program queue
  - Step/Run control
  - Bit trace and flags
  - Register panel
- **Memory systems**
  - Data memory window (0x0400-0x07FF)
  - Heap memory window (0xB700-0xD6FF)
  - Heap bank allocation view (128 x 64B)
- **Virtual routines / I/O**
  - Console read/write
  - Halt / dump routines
  - Heap malloc/free routines
- **Error handling**
  - Illegal operation reporting
  - Unsupported instruction reporting

## Screenshots

The UI screenshots are organized under `docs/images/`.

### Program Construction & Execution

![Instruction Builder](docs/images/instruction_builder.png)
![Program + Controls](docs/images/program.png)

### Trace & Machine State

![Bit Trace](docs/images/bit_trace.png)
![Flags](docs/images/flag.png)
![Registers](docs/images/register.png)
![Output](docs/images/output.png)

### Memory & Heap Views

![Data Memory](docs/images/data_memory.png)
![Heap Memory](docs/images/heap_memory.png)
![Heap Banks](docs/images/heap_bank.png)

### Built-in Documentation Panels

![Instruction Guide](docs/images/instrucion_guide.png)
![PC Memory Heap Guide](docs/images/memory_exlain.png)
![Virtual Routines](docs/images/virtual_routine.png)

## Tech Stack

- **Core VM (CLI):** C
- **Frontend:** Next.js 14, React 18, TypeScript
- **Styling:** CSS (`web/app/globals.css`)
- **Build tooling:** Make (C binary), npm (web app)
- **API wrapper:** Next.js Route Handler (`web/app/api/run/route.ts`) invoking the native VM binary

## Run

### 1) C CLI VM

Build and run from repository root:

```bash
make
./vm_riskxvii <memory_image_binary>
```

Implementation entry points:

- `vm_riskxvii.c`
- `vm_riskxvii.h`

### 2) Web simulator

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

```text
.
├── vm_riskxvii.c          # C CLI VM implementation
├── vm_riskxvii.h          # C VM headers / structures
├── Makefile               # C build
├── examples/              # sample .mi and tests
├── docs/
│   └── images/            # README screenshots
└── web/
    ├── app/page.tsx       # Web VM UI + execution logic
    ├── app/globals.css    # UI styling
    ├── app/api/run/route.ts
    └── README.md
```

## Notes

- The web app is an interactive simulator and also keeps `/api/run` support for `.mi` execution via the native binary.
- For CLI-level VM behavior details, refer directly to `vm_riskxvii.c`.
