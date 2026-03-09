TARGET = vm_riskxvii

CC = gcc

CFLAGS     = -c  -Os  -s -fno-exceptions -ffunction-sections -fdata-sections 
LDFLAGS = -s
SRC        = vm_riskxvii.c
OBJ        = $(SRC:.c=.o)

all:$(TARGET)

$(TARGET):$(OBJ)
	$(CC)  -o $@ $(OBJ) $(LDFLAGS)

.SUFFIXES: .c .o

.c.o:
	 $(CC) $(CFLAGS)  $<

run:
	./$(TARGET)

test:
	echo what are we testing?!

clean:
	rm -f *.o *.obj $(TARGET)

compress:
	upx --best $(TARGET)