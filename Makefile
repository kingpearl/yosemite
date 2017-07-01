##
# Yosemite Make
# Copyright(c) 2015 King Pearl LLC
##
SHELL := /bin/bash

REPO = kingpearl/yosemite

all: configure
	
clean:
	rm -fR node_modules

configure:
	npm install

push:
	rm -fR .git
	git init
	git add .
	git commit -m "Initial release"
	git remote add origin gh:$(REPO).git
	git push origin master

update:
	npm update

.PHONY: test