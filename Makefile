all:
	$(MAKE) -C cli all

run:
	$(MAKE) -C cli run

test:
	$(MAKE) -C cli test

clean:
	$(MAKE) -C cli clean

compress:
	$(MAKE) -C cli compress
