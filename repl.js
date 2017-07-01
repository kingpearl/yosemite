/**
 * Yosemite REPL
 * Copyright(c) 2015 King Pearl LLC
 */
var repl = require('repl')

module.exports = function() {
	return new Repl()
}

var Repl = function() {
	repl.start({
	  prompt: 'yosemite> ',
	  input: process.stdin,
	  output: process.stdout,
	  useColors: true
	})
}