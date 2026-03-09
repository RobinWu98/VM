# CLI VM (C)

This directory contains the C implementation of the RISK-XVII virtual machine.

## Files

- `vm_riskxvii.c`: VM implementation
- `vm_riskxvii.h`: VM data structures and declarations
- `Makefile`: CLI build script
- `examples/`: sample memory images and test scripts

## Build

From repository root:

```bash
make
```

Or build only CLI:

```bash
make -C cli
```

## Run

```bash
./cli/vm_riskxvii <memory_image_binary>
```

Example:

```bash
./cli/vm_riskxvii ./cli/examples/printing_h/printing_h.mi
```

## Run Example Tests

```bash
bash ./cli/examples/test/complex_case.sh
```

This script runs:

- printing_h
- add_2_numbers
- branch

and checks expected stdout output.
