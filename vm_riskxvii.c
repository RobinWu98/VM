#include <stdio.h>
#include <stdint.h>

#include "vm_riskxvii.h"

// shwu7827
// Shangwei Wu

// printing the register_dump message
void register_dump(struct blob *vm){
    printf("PC = 0x%08lx;\n",(vm->pc - &(vm->inst_mem[0]))*4);

    for(int i = 0; i < 32; i++){
        printf("R[%d] = 0x%08x;\n",i,vm->registers[i]);
    }
}

// when calling try to malloc a space for the program, if succeeded set the block to be allocated 
void self_malloc(struct bank* head, int bytes, uint32_t* r28){


    struct bank* current = head;

    int count = bytes / 64;
    int cursor = 0;

    if(bytes % 64 != 0){
        count++;
    }

    if(count > 128){
        *r28 = 0;
        return;
    }

    // check from which node is able to hold bytes
    if(head->is_allocated != 0){

        int allocate = 0;
        for(int i = 0; i < 128; i++){

            if(i + count > 128){
                *r28 = 0;
                break;
            }

            
            if((head+i)->is_allocated == 0){

                for(int j = 0; j < count; j++){
                    
                    if((head+i+j)->is_allocated != 0){
                        allocate = 0;
                        break;
                    }else{allocate = 1;}
                }

                if(allocate == 1){
                    cursor = i;
                    current = head + i;
                    break;
                }else{continue;}
            
            }
        }

        if(allocate == 0){
            *r28 = 0;
            return;
        }
        
    }

    if(count == 0){
        current->is_allocated = 1;
        current->is_head = 1;
        current->num_banks = 1;
    }
    else{

        for(int j = 0; j < count; j++){
            if(j == 0){
                current->is_allocated = 1;
                current->is_head = 1;
                current->num_banks = 1; 
            }else{
                (current+j)->is_allocated = 1;
            }
        }

    }
   
    *r28 = 0xb700 + cursor * 64;

}

// when calling check if able to free, if not, printing error message and quit 
// otherwise free related blocks
int self_free(struct bank* head, int position,struct blob *vm){
   
    int bank = (position - 0xb700) / 64;
    if((head+bank)->is_head == 0){
        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
        register_dump(vm);
        return 1;
    }

    if((head + bank)->is_allocated == 0){
        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
        register_dump(vm);
        return 1;
    }

    for(int i = 0; i < (head+bank)->num_banks; i++){
        (head+bank + i)->is_allocated = 0;
        (head+bank + i)->is_head = 0;
        (head+bank + i)->num_banks = 0;
        for(int i = 0; i < 64; i++){
            (head+bank + i)->bank_size[i] = '0';
        }
        
    }

    return 0;
}

// when store operation calling the virtual routine, check the related one and doing operation
int check_vr_store(uint32_t rs2,uint32_t memory_value,struct blob *vm,uint32_t rs2_value){
    if(memory_value == 0x800){

        printf("%c",(rs2 << 24) >> 24);

    }else if(memory_value == 0x804){

        printf("%d",(int32_t)rs2 );

    }else if(memory_value == 0x808){
        
        printf("%x",(uint32_t)rs2 );

    }else if(memory_value == 0x820){
        
        printf("%x",*(vm->pc));

    }else if(memory_value == 0x824){

        register_dump(vm);

    }else if(memory_value == 0x828){

        if(rs2 >= 0x0 && rs2 <= 0x3ff){
            printf("%x",vm->registers[rs2/4]);
        }else if(rs2 >= 0x400 && rs2 <= 0x7ff){
            printf("%x",vm->data_mem[rs2-1024]);
        }

    }else if(memory_value == 0x830){

        self_malloc(vm->head,vm->registers[rs2_value],&vm->registers[28]);
        
    }else if(memory_value == 0x834){
       
        int return_value = self_free(vm->head,vm->registers[rs2_value],vm);
        return return_value;

    }else if(memory_value == 0x80C){
        printf("CPU Halt Requested\n");
        return 1;

    }else{
        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
        register_dump(vm);
        return 1;
    }
    return 0;
}

// when load operation calling the virtual routine, check the related one and doing operation
void check_vr_load(uint32_t* rd,uint32_t memory_value){
     
    if(memory_value == 0x812){

        char c = '0';
        scanf("%c", &c);
        getchar();
        *rd = c;

    }else if(memory_value == 0x816){

        int num = 0;
        scanf("%d", &num);
        *rd = num;
      
    }
}


// following 5 are load operation, loading from M[rd]
void lb(uint32_t* rd,uint8_t* memory, uint32_t memory_value){

    *rd = *(memory + memory_value - 1024);

    if((*rd >> 7 & 1) == 1){
        *rd = *rd | 0XFFFFFF00;
    }

}

void lh(uint32_t* rd,uint8_t* memory, uint32_t memory_value){
    *rd = *(memory + memory_value - 1024+1) << 8 | *(memory + memory_value - 1024);

    if((*rd >> 15 & 1) == 1){
        *rd = *rd | 0XFFFF0000;
    }
   
}

void lw(uint32_t* rd,uint8_t* memory, uint32_t memory_value){
    *rd = *(memory + memory_value - 1024 +3) << 24 |*(memory+ memory_value - 1024+2) << 16 |*(memory+ memory_value - 1024+1) << 8 | *(memory+ memory_value - 1024) ;
    
}

void lbu(uint32_t* rd,uint8_t* memory, uint32_t memory_value){
    *rd = *(memory + memory_value - 1024);
   
}

void lhu(uint32_t* rd,uint8_t* memory, uint32_t memory_value){
    *rd = *(memory + memory_value - 1024+1) << 8 | *(memory + memory_value - 1024) ;
    
}

// loading from the heap sapce, if the space is not allocated, printing error message
int load_from_heap(struct bank* head, uint32_t memory_position,uint32_t* rd, int bytes, int sign, struct blob *vm){


    int num = (memory_position - 0xb700) / 64;
  
    int count = (memory_position - 0xb700) % 64;

    if((head + num)->is_allocated == 0){
        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
        register_dump(vm);
        return 1;
    }

    struct bank* current = head;

    if(bytes == 4){ // lw
        *rd  =  (current + num)->bank_size[count + 3] << 24 | 
                (current + num)->bank_size[count + 2] << 16 | 
                (current + num)->bank_size[count + 1] << 8 | 
                (current + num)->bank_size[count] ;
    }

    if(bytes == 2 && sign == 1){ //lh
        *rd = (current + num)->bank_size[count + 1] << 8 | 
              (current + num)->bank_size[count] ;
        if((*rd >> 15 & 1) == 1){
            *rd = *rd | 0XFFFF0000;
        }
    }
    
    if(bytes == 2 && sign == 0){ //lhu
        *rd = (current + num)->bank_size[count + 1] << 8 | 
              (current + num)->bank_size[count] ;
    }

    if(bytes == 1 && sign == 1){ //lb
        *rd =   (current + num)->bank_size[count];
        if((*rd >> 7 & 1) == 1){
            *rd = *rd | 0XFFFFFF00;
        }
    }

    if(bytes == 1 && sign == 0){ //lbu
        *rd =   (current + num)->bank_size[count];
    }

    return 0;
  
}



// following 3 are store operation, set M[rd] to the required value
void sb(uint8_t* memory,uint32_t rs2,uint32_t memory_value){
        *(memory + memory_value - 1024) = (rs2 << 24) >> 24;
    
}

void sh(uint8_t* memory,uint32_t rs2,uint32_t memory_value){

        *(memory + memory_value - 1024) = (rs2 << 24) >> 24;
        *(memory + memory_value - 1024+1) = (rs2 << 16) >> 24;
}

void sw(uint8_t* memory,uint32_t rs2,uint32_t memory_value){

        *(memory + memory_value - 1024) = (rs2 << 24) >> 24;
        *(memory + memory_value - 1024+1) = (rs2 << 16) >> 24;
        *(memory + memory_value - 1024+2) = (rs2 << 8) >> 24;
        *(memory + memory_value - 1024+3) = rs2 >> 24;
    
}


// store to heap, if the space is not allocated, printing error message
int store_to_heap(struct bank* head, uint32_t memory_position,uint32_t rs2,struct blob *vm, int bytes){

    
    int num = (memory_position - 0xb700) / 64;
  
    int count = (memory_position - 0xb700) % 64;
    
    if((head + num)->is_allocated == 0){
        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
        register_dump(vm);
        return 1;
    }

    struct bank* current = head;

    if(bytes == 4){
        (current + num)->bank_size[count] = rs2 & 0xFF;
        (current + num)->bank_size[count + 1] = (rs2 >> 8) & 0xFF;
        (current + num)->bank_size[count + 2] = (rs2 >> 16) & 0xFF;
        (current + num)->bank_size[count + 3] = (rs2 >> 24) & 0xFF;
    }else if(bytes == 2){
        (current + num)->bank_size[count] = (rs2 >> 16) & 0xFF;
        (current + num)->bank_size[count + 1] = (rs2 >> 24) & 0xFF;
    }else if(bytes == 1){
        (current + num)->bank_size[count] = (rs2 >> 24) & 0xFF;
    }

    return 0;
}


// following three functions are used to get rd, r1, r2 value from the related instruction.
unsigned int get_rd(uint32_t instruction){
    uint32_t rd_mask = 0X1f;
    unsigned int rd = (instruction >> 7 & rd_mask);
    return rd;
}

unsigned int get_rs1(uint32_t instruction){
    uint32_t rs1_mask = 0X1f;
    unsigned int rs1 = (instruction >> 15 & rs1_mask);
    return rs1;
}

unsigned int get_rs2(uint32_t instruction){
    uint32_t rs2_mask = 0X1f;
    unsigned int rs2 = (instruction >> 20 & rs2_mask);
    return rs2;
}



// pass the number into 2's complement function to get signed value.
int32_t two_complement(uint32_t imm, int length){

    int32_t signed_imm = 0;
    if((imm >> (length-1)) == 1){
        if(length == 12){
            signed_imm = (imm | 0XFFFFF000);
        }else if(length == 13){
            signed_imm = (imm | 0XFFFFE000); 
        }else if(length == 21){
            signed_imm = (imm | 0XFFE00000);
        }
    } 
    else{signed_imm = imm;}
    return signed_imm;
}


// based on different types,  get the imm number from instruction, 
uint32_t get_imm_I(uint32_t instruction){

    uint32_t imm_mask = 0Xfff;
    uint32_t imm = (instruction >> 20 & imm_mask);

    return imm;
}

uint32_t get_imm_S(uint32_t instruction){

    uint32_t imm_mask_1 = 0X1f;
    uint32_t imm_mask_2 = 0X7f;
    
    uint32_t imm = (instruction >> 7 & imm_mask_1)  | ((instruction >> 25 & imm_mask_2) << 5);

    return imm;
}

uint32_t get_imm_U(uint32_t instruction){

    uint32_t imm_mask = 0Xfffff;
    uint32_t imm = (instruction >> 12 & imm_mask);

    return imm;
}

uint32_t get_imm_UJ(uint32_t instruction){

    uint32_t imm_mask_1 = 0Xff;  // 19:12
    uint32_t imm_mask_2 = 0X3ff; // 10:1
    uint32_t imm_mask_3 = 0X1;   //  20 11

    uint32_t imm = 
    ((instruction >> 12 & imm_mask_1) << 12) | 
    ((instruction >> 20 & imm_mask_3) << 11) |
    ((instruction >> 21 & imm_mask_2) << 1)  | 
    ((instruction >> 31 & imm_mask_3) << 20) ;

    return imm;
}

uint32_t get_imm_SB(uint32_t instruction){

    uint32_t imm_mask_1 = 0X1;
    uint32_t imm_mask_2 = 0Xf;
    uint32_t imm_mask_3 = 0X3f;

    uint32_t imm =  ((instruction >> 7 & imm_mask_1) << 11) |
                    ((instruction >> 8 & imm_mask_2) << 1)  |
                    ((instruction >> 25 & imm_mask_3) << 5) |
                    ((instruction >> 31 & imm_mask_1) << 12 );
    return imm;
}



// based on different types, before excuting the actual command,
// load related imm, r1, r2, rd values 
void type_R_init(unsigned int* rd, unsigned int* rs1, unsigned int* rs2, uint32_t instruction){

        *rd = get_rd(instruction);
        *rs1 = get_rs1(instruction);
        *rs2 = get_rs2(instruction);

}

void type_I_init(unsigned int* rd, unsigned int* rs1, uint32_t* imm, int32_t* imm_value, uint32_t instruction){
        *rd = get_rd(instruction);
        *rs1 = get_rs1(instruction);
        *imm = get_imm_I(instruction);
        *imm_value = two_complement(*imm,12);
}

void type_S_init(unsigned int* rs1, unsigned int* rs2, uint32_t* imm, int32_t* imm_value, uint32_t instruction){

        *rs1 = get_rs1(instruction);
        *rs2 = get_rs2(instruction);
        *imm = get_imm_S(instruction);
        *imm_value = two_complement(*imm,12);
}

void type_SB_init(unsigned int* rs1, unsigned int* rs2, uint32_t* imm, int32_t* imm_value, uint32_t instruction){

        *rs1 = get_rs1(instruction);
        *rs2 = get_rs2(instruction);
        *imm = get_imm_SB(instruction);
        *imm_value = two_complement(*imm,13);
}


// decoding the instructions and doing calculaion.
int ins_decode(struct blob *vm){

    uint32_t opcode = 0X7f; // 7 bits of 1 
    uint32_t func3  = 0X7;  // 3 bits of 1
    uint32_t func7  = 0X7f; // 7 bits of 1

    // the program keeps running unitil we meet program Halt or error.

        while(1){

            unsigned int rd = 0;
            unsigned int rs1 = 0;
            unsigned int rs2 = 0;
            uint32_t imm = 0;
            int32_t imm_value = 0;
            uint32_t instruction = 0; // current excuting instruction
            
            vm->registers[0] = 0;
            instruction = *(vm->pc); // change all operations that based on instruction to this line

            // opcode = 1101111 Type: UJ 1--> jal
            if((instruction & opcode) == 0X6f){ 

                imm = get_imm_UJ(instruction);
                imm_value = two_complement(imm,21);
                rd = get_rd(instruction);

                vm->registers[rd] = (vm->pc  - &(vm->inst_mem[0])) * 4 + 4;
                vm->pc = vm->pc + imm_value/4;

                continue;
            }

            // opcode = 1100111 Type: I  1--> jalr
            else if((instruction & opcode) == 0X67){

                imm = get_imm_I(instruction);
                imm_value = two_complement(imm,12);

                rd = get_rd(instruction);
                rs1 = get_rs1(instruction);

                vm->registers[rd] = (vm->pc  - &(vm->inst_mem[0])) * 4 + 4;
                vm->pc = &(vm->inst_mem[vm->registers[rs1] / 4+ imm_value/4]);
               
                continue;

        
            }

            // opcode = 1100011 Type: SB 6--> beq bne blt bge bltu bgeu
            else if((instruction & opcode) == 0X63){
                
                type_SB_init(&rs1, &rs2, &imm, &imm_value,instruction);

                if((instruction >> 12 & func3) == 0){ // beq func3 = 0

                    if((int32_t)vm->registers[rs1] == (int32_t)vm->registers[rs2]){
                        vm->pc = vm->pc + imm_value/4;
                        continue;
                    }
                }

                else if((instruction >> 12 & func3) == 1){ // bne func3 = 1
                  
                    if((int32_t)vm->registers[rs1] != (int32_t)vm->registers[rs2]){
                        vm->pc = vm->pc + imm_value/4;
                        continue;
                    }
                }

                else if((instruction >> 12 & func3) == 4){ // blt func3 = 100

                    if((int32_t)vm->registers[rs1] < (int32_t)vm->registers[rs2]){
                        vm->pc = vm->pc + imm_value/4;
                        continue;
                    }
                }

                else if((instruction >> 12 & func3) == 5){ // bge func3 = 101

                    if((int32_t)vm->registers[rs1] >= (int32_t)vm->registers[rs2]){
                        vm->pc = vm->pc + imm_value/4;
                        continue;
                    }
                }

                else if((instruction >> 12 & func3) == 6){ // bltu func3 = 110
   
                    if(vm->registers[rs1] < vm->registers[rs2]){
                        vm->pc = vm->pc + imm/4;
                        continue;
                    }
                }

                else if((instruction >> 12 & func3) == 7){ // bgeu func3 = 111

                    if(vm->registers[rs1] >= vm->registers[rs2]){
                        vm->pc = vm->pc + imm/4;
                        continue;
                    }

                }

                else{
                    printf("Instruction Not Implemented: 0x%x\n",instruction);
                    register_dump(vm);
                    return 1;
                }

            }

            // opcode = 0110111 Type: U  1--> lui
            else if((instruction & opcode) == 0X37){

                rd = get_rd(instruction);
                imm = get_imm_U(instruction);

                vm->registers[rd] = imm << 12;
            
            }

            // opcode = 0110011 Type: R  10-->  add sub sll slt sltu xor srl sra or and
            else if((instruction & opcode) == 0X33){ 

                type_R_init(&rd,&rs1,&rs2,instruction);

                // func3 = 000 add sub
                if((instruction >> 12 & func3) == 0){ 

                    if((instruction >> 25 & func7) == 0){  // add  func7 = 0000000
                        vm->registers[rd] = vm->registers[rs1] + vm->registers[rs2];
                    }

                    else if((instruction >> 25 & func7) == 32){  // sub  func7 = 100000
                        vm->registers[rd] = vm->registers[rs1] - vm->registers[rs2];
                    }

                    else{
                        printf("Instruction Not Implemented: 0x%x\n",instruction);
                        register_dump(vm);
                        return 1;
                    }
                
                }
                
                // func3 = 001 sll
                else if((instruction >> 12 & func3) == 1){ 
                    if((instruction >> 25 & func7) == 0){  // sll  func7 = 0000000
                        vm->registers[rd] = vm->registers[rs1] << vm->registers[rs2];
                    }
                }

                // func3 = 010 slt
                else if((instruction >> 12 & func3) == 2){ 

                    if((instruction >> 25 & func7) == 0){  // slt  func7 = 0000000
                        vm->registers[rd] =  ((int32_t)vm->registers[rs1] < (int32_t)vm->registers[rs2]) ? 1 : 0;
                    }
        
                }

                // func3 = 011 sltu
                else if((instruction >> 12 & func3) == 3){ 

                    if((instruction >> 25 & func7) == 0){  // sltu  func7 = 0000000
                        vm->registers[rd] =  (vm->registers[rs1] < vm->registers[rs2]) ? 1 : 0;

                    }
                }

                // func3 = 100 xor
                else if((instruction >> 12 & func3) == 4){ 
                    if((instruction >> 25 & func7) == 0){  // xor  func7 = 0000000
                        vm->registers[rd] = vm->registers[rs1] ^ vm->registers[rs2];
                    }
                }

                // func3 = 101 srl sra
                else if((instruction >> 12 & func3) == 5){ 

                    if((instruction >> 25 & func7) == 0){  // srl  func7 = 0000000
                        vm->registers[rd] = vm->registers[rs1] >> vm->registers[rs2];
                    }

                    else if((instruction >> 25 & func7) == 32){  // sra  func7 = 1000000

                        uint32_t shift_value = vm->registers[rs1];

                        for(int i = 0; i < vm->registers[rs2]; i++){
                            shift_value = shift_value >> 1 | shift_value << 31 ;
                        }

                        vm->registers[rd] = shift_value ;
        
                    }

                    else{
                        printf("Instruction Not Implemented: 0x%x\n",instruction);
                        register_dump(vm);
                        return 1;
                    }
                
                }
                
                // func3 = 110 or 
                else if((instruction >> 12 & func3) == 6){ 
                    if((instruction >> 25 & func7) == 0){  // or  func7 = 0000000
                        vm->registers[rd] =  vm->registers[rs1] | vm->registers[rs2];
                    }
                }

                // func3 = 111 and
                else if((instruction >> 12 & func3) == 7){ 
                    if((instruction >> 25 & func7) == 0){  // and  func7 = 0000000
                        vm->registers[rd] =  vm->registers[rs1] & vm->registers[rs2];
                    }
                }

                else{
                    printf("Instruction Not Implemented: 0x%x\n",instruction);
                    register_dump(vm);
                    return 1;
                }

            }

            // opcode = 0100011 Type: S  3--> sb sh sw
            else if((instruction & opcode) == 0X23){

                type_S_init(&rs1,&rs2,&imm,&imm_value,instruction);
                uint32_t memory_position = vm->registers[rs1] + imm_value;

                if((instruction >> 12 & func3) == 0){ // sb func3 = 0

     
                    if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        sb(&(vm->data_mem[0]), vm->registers[rs2], memory_position);
                    }

                    else if(memory_position >= 0x800 && memory_position <= 0x8ff){
                        if(check_vr_store(vm->registers[rs2],memory_position,vm,rs2) ==1){
                            return 1;
                        }
                    }
                    
                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(store_to_heap(vm->head,memory_position,vm->registers[rs2],vm,1) == 1){
                            return 1;
                        }
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }
                }

                else if((instruction >> 12 & func3) == 1){ // sh func3 = 1


                    if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        sh(&(vm->data_mem[0]), vm->registers[rs2], memory_position);
                    }

                    else if(memory_position >= 0x800 && memory_position <= 0x8ff){
                        if(check_vr_store(vm->registers[rs2],memory_position,vm,rs2) == 1){
                            return 1;
                        }
                    }
                    
                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(store_to_heap(vm->head,memory_position,vm->registers[rs2],vm,2) == 1){
                            return 1;
                        }
                        
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }
                }

                else if((instruction >> 12 & func3) == 2){ // sw func3 = 10
                    
        
                    if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        sw(&(vm->data_mem[0]), vm->registers[rs2], memory_position);
                    }

                    else if(memory_position >= 0x800 && memory_position <= 0x8ff){
                        if(check_vr_store(vm->registers[rs2],memory_position,vm,rs2) == 1){
                            return 1;
                        }
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(store_to_heap(vm->head,memory_position,vm->registers[rs2],vm,4) == 1){
                            return 1;
                        }
                        
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }

                }

                else{
                    printf("Instruction Not Implemented: 0x%x\n",instruction);
                    register_dump(vm);
                    return 1;
                }

            }

            // opcode = 0010011 Type: I  6-->  adi slti sltiu xori ori andi
            else if((instruction & opcode) == 0X13){ 

                type_I_init(&rd,&rs1, &imm, &imm_value, instruction);

                if((instruction >> 12 & func3) == 0){ // adi func3 = 000
                    vm->registers[rd] = vm->registers[rs1] + imm_value;
                }
                
                else if((instruction >> 12 & func3) == 2){ // slti func3 = 010

                    vm->registers[rd] =  ((int32_t)vm->registers[rs1] < imm_value) ? 1 : 0;
                }

                else if((instruction >> 12 & func3) == 3){ // sltiu func3 = 011

                    vm->registers[rd] =  (vm->registers[rs1] < imm) ? 1 : 0;
                }
                
                else if((instruction >> 12 & func3) == 4){ // xori func3 = 100
                    vm->registers[rd] =  vm->registers[rs1] ^ imm_value;
                }
                
                else if((instruction >> 12 & func3) == 6){ // ori func3 = 110
                    vm->registers[rd] =  vm->registers[rs1] | imm_value;
                }
                
                else if((instruction >> 12 & func3) == 7){ // andi func3 = 111
                    vm->registers[rd] =  vm->registers[rs1] & imm_value;
                }
                
                else{
                    printf("Instruction Not Implemented: 0x%x\n",instruction);
                    register_dump(vm);
                    return 1;
                }

            }
            
            // opcode = 0000011 Type: I  5 --> lb lh lw lbu lhu
            else if((instruction & opcode) == 0X3){ 

                type_I_init(&rd,&rs1, &imm, &imm_value, instruction);
                uint32_t memory_position = vm->registers[rs1] + imm_value;

                if((instruction >> 12 & func3) == 0){ // lb func3 = 000

                    if(memory_position >= 0x000 && memory_position <= 0x3ff){

                        int ins = (memory_position) / 4;
                        if((memory_position) % 4 == 0){  // first 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF) ;

                        }else if((memory_position) % 4 == 1){ // second 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF00) >>8;

                        }else if((memory_position) % 4 == 2){ // third 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF0000) >>16;
                         
                        }else if((memory_position) % 4 == 3){ // fourth 8 bits in a 32 bits instruction

                            vm->registers[rd] = vm->inst_mem[ins] >> 24;
                        }

                        if((vm->registers[rd] >> 7 & 1) == 1){
                            vm->registers[rd] = vm->registers[rd] | 0XFFFFFF00;
                        }
                    }

                    else if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        lb(&vm->registers[rd],&vm->data_mem[0], memory_position);
                        
                    }

                    else if(memory_position == 0x812 || memory_position == 0x816){
                        check_vr_load(&(vm->registers[rd]),memory_position);
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(load_from_heap(vm->head,memory_position,&(vm->registers[rd]),1,1,vm) == 1){
                            return 1;
                        }
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }

                }
                
                else if((instruction >> 12 & func3) == 1){ // lh func3 = 001

                    if(memory_position >= 0x000 && memory_position <= 0x3ff){

                        int ins = (memory_position) / 4;
                        if((memory_position) % 4 == 0){  // first 16 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF) << 8|
                                                (vm->inst_mem[ins] & 0XFF00) >> 8;

                        }else if((memory_position) % 4 == 2){ // second 16 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF0000) >>16|
                                                (vm->inst_mem[ins] >> 24);
                         
                        }

                        if((vm->registers[rd] >> 15 & 1) == 1){
                            vm->registers[rd] = vm->registers[rd] | 0XFFFFFF00;
                        }
                    }

                    else if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        lh(&vm->registers[rd], &vm->data_mem[0],memory_position);
                        
                    }

                    else if(memory_position == 0x812 || memory_position == 0x816){
                        check_vr_load(&(vm->registers[rd]),memory_position);
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(load_from_heap(vm->head,memory_position,&(vm->registers[rd]),2,1,vm) == 1){
                            return 1;
                        }
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }

                }

                else if((instruction >> 12 & func3) == 2){ // lw func3 = 010

                    if(memory_position>= 0x000 && memory_position <= 0x3ff){
                        int ins = (memory_position) / 4;
                        vm->registers[rd] = (vm->inst_mem[ins] & 0XFF     << 24) |
                                            (vm->inst_mem[ins] & 0XFF00   << 16) |
                                            (vm->inst_mem[ins] & 0XFF0000 << 8)  | 
                                            (vm->inst_mem[ins] >> 24) ;
            
                    }

                    else if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        lw(&vm->registers[rd], &vm->data_mem[0], vm->registers[rs1]+imm_value);
                        
                    }

                    else if(memory_position == 0x812 || memory_position == 0x816){
                        check_vr_load(&(vm->registers[rd]),memory_position);
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(load_from_heap(vm->head,memory_position,&(vm->registers[rd]),4,0,vm) == 1){
                            return 1;
                        }
                        
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }
                    
                    
                }

                else if((instruction >> 12 & func3) == 4){ // lbu func3 = 100

                    if(memory_position >= 0x000 && memory_position <= 0x3ff){

                        int ins = (memory_position) / 4;
                        if((memory_position) % 4 == 0){  // first 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF) ;

                        }else if((memory_position) % 4 == 1){ // second 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF00) >>8;

                        }else if((memory_position) % 4 == 2){ // third 8 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF0000) >>16;
                         
                        }else if((memory_position) % 4 == 3){ // fourth 8 bits in a 32 bits instruction

                            vm->registers[rd] = vm->inst_mem[ins] >> 24;
                        }
                         
                    }
                    
                    else if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        lbu(&vm->registers[rd], &vm->data_mem[0], memory_position);
                    }

                    else if(memory_position == 0x812 || memory_position == 0x816){
                        check_vr_load(&(vm->registers[rd]),memory_position);
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(load_from_heap(vm->head,memory_position,&(vm->registers[rd]),1,0,vm) == 1){
                            return 1;
                        }
                        
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }
                }

                else if((instruction >> 12 & func3) == 1){ // lhu func3 = 101

                    if(memory_position >= 0x000 && memory_position <= 0x3ff){
                        int ins = (memory_position) / 4;
                        if((memory_position) % 4 == 0){  // first 16 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF) << 8|
                                                (vm->inst_mem[ins] & 0XFF00) >> 8;

                        }else if((memory_position) % 4 == 2){ // second 16 bits in a 32 bits instruction

                            vm->registers[rd] = (vm->inst_mem[ins] & 0XFF0000) >> 16|
                                                (vm->inst_mem[ins] >> 24);
                         
                        }
                    }
                    
                    else if(memory_position >= 0x400 && memory_position <= 0x7ff){
                        lhu(&vm->registers[rd], &vm->data_mem[0], memory_position);
                    }

                    else if(memory_position == 0x812 || memory_position == 0x816){
                        check_vr_load(&(vm->registers[rd]),memory_position);
                    }

                    else if(memory_position >= 0xb700 && memory_position <= 0xd6c0){
                        if(load_from_heap(vm->head,memory_position,&(vm->registers[rd]),2,0,vm) == 1){
                            return 1;
                        }
                        
                    }
                    else{
                        printf("Illegal Operation: 0x%08x\n",*(vm->pc) );
                        register_dump(vm);
                        return 1;
                    }
                }
                
                else{
                    printf("Instruction Not Implemented: 0x%x\n",instruction);
                    register_dump(vm);
                    return 1;
                }
            }
            
            else{
                printf("Instruction Not Implemented: 0x%x\n",instruction);
                register_dump(vm);
                return 1;
            }

            vm->pc  = vm->pc + 1;
            
        }

    return 0;
}


int main(int c, char** arg){

// need to initialize a pc that points to the current instruction.

    char* location = "";
    
    if(c == 2){
        location = arg[1];
    }
    else{
        printf("please input a valid file routine!\n");
        return 0;
    }
    
    
    FILE *file = fopen(location, "r");
    if (file == NULL) {
        printf("File not found, please try another routine.\n");
        return 1;
     }
  

    // initiating our virtual machine
    struct blob VM = {0};

    VM.head = &VM.heap[0];
    VM.pc = &(VM.inst_mem[0]);

    uint8_t buffer[1] = {0};
    uint8_t inst_mem[INST_MEM_SIZE*4] = {0};

    int i = 0;

    // read 1 byte from file each time
    while (fread(buffer, sizeof(uint8_t), 1, file) > 0 ) {
        if(i < 1024){
            inst_mem[i] = buffer[0];
        }
        else if(i >= 1024){
            VM.data_mem[i-1024] = buffer[0];
        }
        i++;
    }

    for(int l = 0 ; l < 1024; l+=4){
        VM.inst_mem[l/4] = (uint32_t)(inst_mem[l+3]) << 24 | (uint32_t)(inst_mem[l+2]) << 16 | (uint32_t)(inst_mem[l+1]) << 8 | (uint32_t)(inst_mem[l]);
    }

    fclose(file);
    // after initialising the blob, jump into vm and decode the instructions

    
    return ins_decode(&VM);
}