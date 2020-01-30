const NUM_ROMS = 3;
const CONTROL_WORDS = {
	pcOut: 0b00000001, //ROM
	pcIn: 0b00000010,
	pcInc: 0b00000100,
	ramAddrIn: 0b00001000,
	ramIn: 0b00010000,
	ramOut: 0b00100000,
	aIn: 0b01000000,
	aOut: 0b10000000,
	bIn: 0b00000001, //ROM2
	bOut: 0b00000010,
	instDOut: 0b00000100,
	aluAdd: 0b00001000,
	aluSub: 0b00010000,
	aluOut: 0b00100000,
	setFlag: 0b01000000,
	clkOff: 0b10000000,
	needFlag0: 0b00000001, //ROM3
	needFlag1: 0b00000010,
	dispIn: 0b00000100
}
const ROM_ASSIGNMENT = {
	pcOut: 0,
	pcIn: 0,
	pcInc: 0,
	ramAddrIn: 0,
	ramIn: 0,
	ramOut: 0,
	aIn: 0,
	aOut: 0,
	bIn: 1,
	bOut: 1,
	instDOut: 1,
	aluAdd: 1,
	aluSub: 1,
	aluOut: 1,
	setFlag: 1,
	clkOff: 1,
	needFlag0: 2,
	needFlag1: 2,
	dispIn: 2
}
const OP_CODES = {
	ldm: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('bOut'), word('ramOut') | word('aIn')],
	lda: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('instDOut'), word('ramOut') | word('aIn')],
	ldb: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('instDOut'), word('ramOut') | word('bIn')],
	sta: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('instDOut'), word('ramIn') | word('aOut')],
	stb: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('instDOut'), word('ramIn') | word('bOut')],
	sea: [word('pcOut'), word('pcInc'), word('instDOut') | word('aIn')],
	seb: [word('pcOut'), word('pcInc'), word('instDOut') | word('bIn')],
	add: [word('pcOut'), word('pcInc'), word('aluAdd'), word('aluOut') | word('aIn')],
	sub: [word('pcOut'), word('pcInc'), word('aluSub'), word('aluOut') | word('aIn')],
	cmp: [word('pcOut'), word('pcInc'), word('setFlag') | word('aOut') | word('bOut')],
	jmp: [word('pcOut'), word('pcInc'), word('instDOut') | word('pcIn')],
	jpf: [word('pcOut'), word('pcInc'), word('instDOut') | word('pcIn') | word('needFlag1')],
	njf: [word('pcOut'), word('pcInc'), word('instDOut') | word('pcIn') | word('needFlag0')],
	dsp: [word('pcOut'), word('pcInc'), word('aOut') | word('dispIn')],
	hlt: [word('pcOut'), word('pcInc'), word('clkOff')],
	stm: [word('pcOut'), word('pcInc'), word('ramAddrIn') | word('bOut'), word('ramIn') | word('aOut')]
}

function word(wd) {
	return CONTROL_WORDS[wd] << ROM_ASSIGNMENT[wd] * 8;
}

var codeRoms = [{}, {}, {}];

function genMicro() {
	var idx = 0;
	for (var i in OP_CODES) {
		var strs = OP_CODES[i].map(val => bin(val, 8 * NUM_ROMS));
		var opCode = bin(idx, 4);
		strs.forEach((stepWord, step) => {
			var addr = opCode + bin(step, 4);
			codeRoms.forEach((rom, romNum) => {
				var commandWord = stepWord.substring(8 * (NUM_ROMS - romNum), 8 * ((NUM_ROMS - romNum) - 1));
				console.log('(' + romNum + ') ' + addr + ': ' + commandWord);
				rom[addr] = commandWord;
			});
		});
		idx++;
	}
	codeRoms.forEach((rom, i) => {
		console.log('Updloaded "%s"', ('mCode' + i));
		uploadData('romData', {
			name: 'mCode' + i,
			data: rom
		});
	});
}

//Program looks like:
// OpCode Data
// 0010   00001000

//ROM Input:
// OpCode Step
// 0010   0001