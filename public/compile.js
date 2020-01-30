function parseVal(txt) {
	var rdx = 2;
	if (txt.startsWith('0x')) {
		rdx = 16;
	}
	if (txt.startsWith('0b')) {
		rdx = 2;
	}
	if (txt.startsWith('0d')) {
		rdx = 10;
	}
	var decVal = parseInt(txt.substring(2, txt.length), rdx);
	if (isNaN(decVal)) {
		decVal = 0;
	}
	var binVal = bin(decVal, 8);
	return binVal.substring(binVal.length - 8);
}

function toHex(bin) {
	var hex = parseInt(bin, 2).toString(16).toUpperCase();
	return hex.length == 2 ? hex : '0' + hex;
}

function compile(programName, str) {
	var txt = str ? str : prompt('');
	if (!txt) {
		return;
	}
	var commands = txt.split('\n');
	var machineCode = [{}, {}];
	var opps = Object.getOwnPropertyNames(OP_CODES).map((opp, idx) => {
		return {
			opp: opp,
			code: bin(idx, 8)
		}
	});
	var failed = false;
	var prgm = '';
	commands.forEach((command, idx) => {
		var splitIdx = command.indexOf(';');
		splitIdx = splitIdx > -1 ? splitIdx : command.length;
		command = command.substring(0, splitIdx);
		var args = command.split(' ');
		if (args[0].length < 3) {
			return;
		}
		if (args.length == 1) {
			args[1] = '0d0'
		}
		args[0] = args[0].substring(0, 3);
		args[1] = parseVal(args[1]);
		var addr = bin(idx, 8);
		var oppCode = opps.find(op => op.opp == args[0]);
		if (!oppCode) {
			console.log('Line: %s unknown word %s', args[0], command);
			failed = true;
			return;
		}
		prgm += toHex(addr) + ': ' + toHex(oppCode.code) + ' ' + toHex(args[1]) + '\n';
		machineCode[0][addr] = oppCode.code;
		machineCode[1][addr] = args[1];
	});
	if (!failed) {
		console.log('Compiled program "%s"', programName);
		console.log(prgm);
		uploadData('romData', {
			name: programName + '0',
			data: machineCode[0]
		});
		uploadData('romData', {
			name: programName + '1',
			data: machineCode[1]
		});
	}
}

const BF_CONV = {
	'+': ['seb 0d1', 'add', 'ldb 0d0', 'stm'],
	'-': ['seb 0d1', 'sub', 'ldb 0d0', 'stm'],
	'>': ['lda 0d0', 'seb 0d1', 'add', 'sta 0d0', 'ldb 0d0', 'ldm'],
	'<': ['lda 0d0', 'seb 0d1', 'sub', 'sta 0d0', 'ldb 0d0', 'ldm'],
	'.': ['dsp'],
	'[': ['['],
	']_': ['seb 0d0', 'cmp', 'njf ']
};

function bfCompiler(bf) {
	var asmb = [];
	bf.split('').forEach((char, idx) => {
		if (BF_CONV[char]) {
			asmb = asmb.concat(BF_CONV[char]);
		} else if (char == ']') {
			var endPt = solveJump(bf, idx);
			var numBeforeEnd = 0;
			for (var i = endPt; i >= 0; i--) {
				if (bf[i] == '[') {
					numBeforeEnd++;
				}
			}
			var numFound = 0;
			var jumpTo = 0;
			for (var i = 0; i < asmb.length; i++) {
				if (asmb[i] == '[') {
					numFound++;
				}
				if (numFound == numBeforeEnd) {
					jumpTo = i;
					break;
				}
			}
			var newAsm = BF_CONV[']_'].map(v => v);
			newAsm[2] += '0d' + (jumpTo - (numBeforeEnd - 1));
			asmb = asmb.concat(newAsm);
		}
	});
	asmb.push('hlt');
	asmb = asmb.filter(a => a != '[');
	compile('program', asmb.join('\n'));
	console.log(asmb.join('\n'));
}

function solveJump(str, idx) {
	var arr = str.split('');
	var c = 0;
	for (var i = idx; i >= 0; i--) {
		if (arr[i] == ']') {
			c--;
		} else if (arr[i] == '[') {
			c++;
			if (c == 0) {
				return i;
			}
		}
	}
}