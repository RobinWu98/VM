#ifndef VM_HEADER
#define VM_HEADER


#define INST_MEM_SIZE 256
#define DATA_MEM_SIZE 1024

struct bank {
    int num_banks;
    int is_allocated;
    int is_head;
    uint8_t bank_size[64];
};

struct blob {
    uint32_t inst_mem[INST_MEM_SIZE];
    uint8_t data_mem[DATA_MEM_SIZE];
    uint32_t registers[32];
    uint32_t* pc;
    struct bank *head;
    struct bank heap[128];
};

void register_dump(struct blob *vm);

void self_malloc(struct bank* head, int bytes, uint32_t* r28);

int self_free(struct bank* head, int position,struct blob *vm);

int check_vr_store(uint32_t rs2,uint32_t memory_value,struct blob *vm,uint32_t rs2_value);

void check_vr_load(uint32_t* rd,uint32_t memory_value);

void lb(uint32_t* rd,uint8_t* memory, uint32_t memory_value);

void lh(uint32_t* rd,uint8_t* memory, uint32_t memory_value);

void lw(uint32_t* rd,uint8_t* memory, uint32_t memory_value);

void lbu(uint32_t* rd,uint8_t* memory, uint32_t memory_value);

void lhu(uint32_t* rd,uint8_t* memory, uint32_t memory_value);

int load_from_heap(struct bank* head, uint32_t memory_position,uint32_t* rd, int bytes, int sign,struct blob *vm);

void sb(uint8_t* memory,uint32_t rs2,uint32_t memory_value);

void sh(uint8_t* memory,uint32_t rs2,uint32_t memory_value);

void sw(uint8_t* memory,uint32_t rs2,uint32_t memory_value);

int store_to_heap(struct bank* head, uint32_t memory_position,uint32_t rs2,struct blob *vm, int bytes);

unsigned int get_rd(uint32_t instruction);

unsigned int get_rs1(uint32_t instruction);

unsigned int get_rs2(uint32_t instruction);

int32_t two_complement(uint32_t imm, int length);

uint32_t get_imm_I(uint32_t instruction);

uint32_t get_imm_S(uint32_t instruction);

uint32_t get_imm_U(uint32_t instruction);

uint32_t get_imm_UJ(uint32_t instruction);

uint32_t get_imm_SB(uint32_t instruction);

void type_R_init(unsigned int* rd, unsigned int* rs1, unsigned int* rs2, uint32_t instruction);

void type_I_init(unsigned int* rd, unsigned int* rs1, uint32_t* imm, int32_t* imm_value, uint32_t instruction);

void type_S_init(unsigned int* rs1, unsigned int* rs2, uint32_t* imm, int32_t* imm_value, uint32_t instruction);

void type_SB_init(unsigned int* rs1, unsigned int* rs2, uint32_t* imm, int32_t* imm_value, uint32_t instruction);

int ins_decode(struct blob *vm);

int main(int c, char** arg);

#endif