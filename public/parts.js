var updates = {};

var customParts = [];
var truthTables = {};
var trackCalcs = false;

const SEG_BUF = 5;
const SEG_SIZE = 3;
const SEG_TABLE = [
	[1, 1, 0, 1, 1, 1, 1], //0
	[0, 0, 0, 0, 1, 0, 1], //1
	[1, 1, 1, 0, 1, 1, 0], //2
	[1, 1, 1, 0, 1, 0, 1], //3
	[0, 0, 1, 1, 1, 0, 1], //4
	[1, 1, 1, 1, 0, 0, 1], //5
	[1, 1, 1, 1, 0, 1, 1], //6
	[1, 0, 0, 0, 1, 0, 1], //7
	[1, 1, 1, 1, 1, 1, 1], //8
	[1, 1, 1, 1, 1, 0, 1], //9
];

var SIM_LEN = 0;
try {
	window.test == undefined;
	trackCalcs = true;
} catch (e) {
	importScripts('baseParts.js');
	importScripts('api.js');
	onmessage = function(e) {
		var data = e.data;
		customParts = data.customParts;
		truthTables = data.truthTables;
		SIM_LEN = data.len;
		for (var i in customParts) {
			partList[i] = CustomPart;
		}
		var part = new CustomPart({
			x: 0,
			y: 0
		}, {
			name: data.partName
		});
		var table = createTruthTable(part);
		postMessage({
			table: table,
			partName: data.partName
		});
		console.log('Calculation of %s has finished', data.partName);
		self.close();
	}
}

function bin(val, len) {
	var str = val.toString(2);
	while (str.length < len) {
		str = '0' + str;
	}
	return str;
}

function createNewCustomPart(data) {
	var missingParts = getMissingParts(data.needed)
	if (missingParts.length > 0) {
		console.log('Part that was attempted to be loaded has missing dependencies\nThis could cause problems...');
		console.log('Need to load: ' + missingParts.join(', '));
		// return;
	}
	var inputStructure = [];
	data.parts.sort((a, b) => (a.pos.x + a.pos.y) - (b.pos.x + b.pos.y));
	data.parts.forEach(part => {
		if (part.partName == 'Led' || part.partName == 'Switch') {
			var side = part.pos.y > data.window.hei / 2 ? 2 : 0;
			inputStructure.push({
				side: side,
				lable: part.name,
				partId: part.id
			});
		}
	});
	inputStructure.push({
		side: 1,
		lable: 'disable_part',
		partId: undefined
	});
	customParts[data.name] = {
		inputStructure: inputStructure,
		data: data
	};
	partList[data.name] = CustomPart;
}

function loadPartData(data) {
	var newParts = [];
	data.parts.forEach(partData => {
		if (!partList[partData.partName]) {
			console.log('--MISSING PART--');
			console.log(partData.partName + ' does not exist');
			return;
		}
		var part = new partList[partData.partName]({
			x: partData.pos.x,
			y: partData.pos.y
		}, {
			name: partData.partName
		});
		part.name = partData.name;
		part.len = partData.len || 20;
		part.id = partData.id;
		part.truthTableEnabled = partData.truthTableEnabled != undefined ? partData.truthTableEnabled : true;
		part.connData = partData.connections.map(c => c);
		part.connections = partData.connections.map(conn => {
			var newConn = new Connection({
				side: conn.side,
				lable: conn.lable
			}, part);
			newConn.id = conn.id;
			return newConn;
		});
		newParts.push(part);
	});
	newParts.forEach(part => {
		var newConns = [];
		part.connections.forEach((conn, idx) => {
			if (part.connData[idx].connectedTo) {
				var otherId = part.connData[idx].connectedTo.id;
				var other = undefined;
				newParts.forEach(p => {
					var found = p.connections.find(con => con.id == otherId);
					if (found) {
						other = found;
					}
				});
				if (other) {
					conn.connectedTo = other;
				}
			}
		});
	});
	return newParts;
}

function getMissingParts(needed) {
	var existParts = [];
	for (var i in partList) {
		existParts.push(i);
	}
	var missing = needed.filter(need => !existParts.includes(need));
	return missing;
}

function test() {
	var data = JSON.parse(prompt());
	for (var inp in data) {
		var a = parseInt(inp.substring(0, 8), 2);
		var b = parseInt(inp.substring(8, 16), 2);
		var out = parseInt(data[inp], 2);
		var sum = parseInt(bin(a + b), 2);
		if (sum >= 256) {
			sum -= 256;
		}
		if (sum != out) {
			console.log(a + ' + ' + b + ' = ' + out + ' - ' + sum);
		}
	}
}

function startTruthCalc(partName, len) {
	var worker = new Worker('parts.js');
	worker.postMessage({
		partName: partName,
		customParts: customParts,
		truthTables: truthTables,
		len: len
	});
	worker.onmessage = function(e) {
		var data = e.data;
		truthTables[data.partName] = data.table;
		uploadData('table', {
			data: data.table,
			name: data.partName
		});
	}
}

function createTruthTable(part) {
	var ins = [];
	var outs = [];
	var table = {};
	part.inputStructure.forEach((input, idx) => {
		var publicConn = part.connections[idx];
		if (input.partId) {
			var internalPart = part.parts.find(part => part.id == input.partId);
			if (internalPart.partName == 'Switch') {
				ins.push(internalPart);
			} else if (internalPart.partName == 'Led') {
				outs.push(internalPart);
			}
		}
	});
	var lastLog = 0;
	var started = Date.now();
	for (var i = 0; i < 2 ** ins.length; i++) {
		var pDone = Math.floor((i / (2 ** ins.length)) * 100);
		if (pDone != lastLog) {
			var elapsed = Date.now() - started;
			var timePerP = elapsed / pDone;
			var remTime = (100 - pDone) * timePerP;
			console.log(part.partName + ' - ' + pDone + '%  Time remaining: ' + Math.floor(remTime / 1000) + ' seconds');
			lastLog = pDone;
		}
		var inp = bin(i, ins.length);
		inp.split('').forEach((val, idx) => ins[idx].switchState = val == '1');
		for (var k = 0; k < SIM_LEN; k++) {
			part.parts.forEach(part => part.run(true));
		}
		var out = outs.map(p => p.connections[0].state ? '1' : '0');
		table[inp] = out.join('');
		// console.log(inp + ': ' + out.join(''));
	}
	// truthTables[part.partName] = table;
	return table;
	// console.log('DONE');
}

class CustomPart extends BasicPart {
	constructor(pos, data) {
		if (!customParts[data.name]) {
			return;
		}
		var inputStructure = customParts[data.name].inputStructure;
		var partData = customParts[data.name].data;
		super({
			x: pos.x,
			y: pos.y
		}, inputStructure);
		this.partName = data.name;
		this.isCustomPart = true;
		this.parts = loadPartData(partData);
		this.inputStructure = inputStructure;
		this.drawEnabled = false;
		this.partEnabled = true;
		this.truthTableEnabled = true;
		this.table = [];
		setTimeout((obj) => obj.forceUpdate(), 250, this);
	}
	run(skipDraw) {
		var start = calcs;
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
		if (!truthTables[this.partName]) {
			this.truthTableEnabled = false;
		}
		if (!this.truthTableEnabled) {
			if (this.partEnabled) {
				this.parts.forEach(part => part.run(!this.drawEnabled || skipDraw));
			}
			this.inputStructure.forEach((input, idx) => {
				var publicConn = this.connections[idx];
				if (input.partId) {
					var internalPart = this.parts.find(part => part.id == input.partId);
					if (internalPart.partName == 'Switch') {
						internalPart.switchState = publicConn.state;
					} else if (internalPart.partName == 'Led') {
						publicConn.stateInp = internalPart.connections[0].state;
						if (publicConn.lastState != publicConn.stateInp) {
							updates[this.uId] = true;
						}
					}
				}
				if (input.lable == 'disable_part' && publicConn) {
					this.partEnabled = !publicConn.state;
					if (!this.partEnabled) {
						this.connections.forEach(conn => conn.stateInp = false);
					}
				}
			});
		} else {
			var ins = [];
			var outs = [];
			this.inputStructure.forEach((input, idx) => {
				var publicConn = this.connections[idx];
				if (input.partId) {
					var internalPart = this.parts.find(part => part.id == input.partId);
					if (internalPart.partName == 'Switch') {
						ins.push(publicConn);
					} else if (internalPart.partName == 'Led') {
						outs.push(publicConn);
					}
				}
				if (input.lable == 'disable_part' && publicConn) {
					this.partEnabled = !publicConn.state;
					if (!this.partEnabled) {
						this.connections.forEach(conn => conn.stateInp = false);
					}
				}
			});
			var inBin = ins.map(conn => conn.state ? '1' : '0').join('');
			var outStr = truthTables[this.partName][inBin];
			if (!this.partEnabled) {
				outStr = [...new Array(outStr.length)].map(v => '0').join('');
			}
			outStr.split('').forEach((val, idx) => outs[idx].stateInp = val == '1');
		}
		this.prefVal = calcs - start;
	}
	forceUpdate() {
		this.parts.forEach(p => {
			if (typeof p.forceUpdate == 'function') {
				p.forceUpdate();
			} else {
				updates[p.uId] = true;
			}
		});
		updates[this.uId] = true;
	}
	specUI(x, y) {
		if (!this.truthTableEnabled) {
			y += UI_Y_SPACE;
			if (btn(x, y, TOOLBAR_WID - 30, 15, (!this.drawEnabled ? 'Show' : 'Hide') + ' internal') && mouseUp) {
				this.drawEnabled = !this.drawEnabled;
				mouseUp = false;
			}
		}
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, (!this.truthTableEnabled ? 'Enable' : 'Disable') + ' truth table') && mouseUp) {
			if (this.truthTableEnabled) {
				this.truthTableEnabled = false;
				this.forceUpdate();
			} else {
				if (!truthTables[this.partName]) {
					var simLen = prompt('Enter a sim len');
					if (simLen) {
						startTruthCalc(this.partName, simLen);
					}
				}
				this.truthTableEnabled = true;
			}
			mouseUp = false;
		}
	}
}

class Transistor extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in'
		}, {
			side: 3,
			lable: 'ctrl'
		}, {
			side: 2,
			lable: 'out'
		}]);
		this.partName = 'Transistor';
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			this.connections[2].stateInp = this.connections[0].state && this.connections[1].state;
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
	}
}

class Not extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in'
		}, {
			side: 2,
			lable: 'out'
		}]);
		this.partName = 'Not';
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		this.connections[1].stateInp = !this.connections[0].state;
		this.connections.forEach(conn => conn.run());
	}
}

class Switch extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'out'
		}]);
		this.switchState = false;
		this.partName = 'Switch';
		this.name = 'switch';
	}
	draw(skipDraw) {
		// fill(255, 50);
		this.setWH();
		if (this.switchState) {
			fill(0, 200, 0);
		} else {
			fill(200, 0, 0);
		}
		stroke(this.uiEnabled ? 200 : 100);
		rect(this.pos.x, this.pos.y, this.w, this.h);
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw(skipDraw));
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
		if (this.connections[0].stateInp != this.switchState) {
			updates[this.uId] = true;
		}
		this.connections[0].stateInp = this.switchState;
	}
	specUI(x, y) {
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'on')) {
			this.switchState = true;
		}
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'off')) {
			this.switchState = false;
		}
		y += UI_Y_SPACE + textSize();
		fill(255);
		noStroke();
		text('Name: ' + this.name, x, y);
		y += UI_Y_SPACE - textSize();
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Set name') && mouseUp) {
			this.name = prompt('Name?', this.name);
			p5Instance._pInst._onmouseup();
			mouseUp = false;
		}
	}
}

class Button extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'out'
		}]);
		this.switchState = false;
		this.partName = 'Button';
	}
	draw(skipDraw) {
		this.setWH();
		if (this.switchState) {
			fill(0, 200, 0);
		} else {
			fill(200, 0, 0);
		}
		stroke(this.uiEnabled ? 200 : 100);
		ellipse(this.pos.x + this.w / 2, this.pos.y + this.w / 2, this.w, this.w);
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw(skipDraw));
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
		if (this.connections[0].stateInp != this.switchState) {
			updates[this.uId] = true;
		}
		this.connections[0].stateInp = this.switchState;
	}
	specUI(x, y) {
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'on')) {
			this.switchState = true;
		} else {
			this.switchState = false;
		}
	}
}

class Led extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in'
		}]);
		this.partName = 'Led';
		this.name = 'led';
	}
	draw(skipDraw) {
		this.setWH();
		fill(this.connections[0].state ? color(0, 255, 0) : color(0, 50, 0));
		stroke(this.uiEnabled ? 200 : 100);
		ellipse(this.pos.x + this.w / 2, this.pos.y + this.w / 2, this.w, this.w);
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw());
	}
	specUI(x, y) {
		y += UI_Y_SPACE + textSize();
		fill(255);
		noStroke();
		text('Name: ' + this.name, x, y);
		y += UI_Y_SPACE - textSize();
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Set name') && mouseUp) {
			this.name = prompt('Name?', this.name);
			p5Instance._pInst._onmouseup();
			mouseUp = false;
		}
	}
}

class Junction extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in0'
		}, {
			side: 0,
			lable: 'in1'
		}, {
			side: 2,
			lable: 'out0'
		}, {
			side: 2,
			lable: 'out1'
		}]);
		this.partName = 'Junction';
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			var state = this.connections[0].state || this.connections[1].state;
			this.connections[2].stateInp = state;
			this.connections[3].stateInp = state;
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
	}
}

class DipSwitch extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 2,
			lable: 'd7'
		}, {
			side: 2,
			lable: 'd6'
		}, {
			side: 2,
			lable: 'd5'
		}, {
			side: 2,
			lable: 'd4'
		}, {
			side: 2,
			lable: 'd3'
		}, {
			side: 2,
			lable: 'd2'
		}, {
			side: 2,
			lable: 'd1'
		}, {
			side: 2,
			lable: 'd0'
		}]);
		this.switchStates = [false, false, false, false, false, false, false, false];
		this.partName = 'DipSwitch';
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
		this.connections.forEach((conn, idx) => {
			conn.stateInp = this.switchStates[idx];
		});
	}
	specUI(x, y) {
		this.switchStates.forEach((state, idx) => {
			y += UI_Y_SPACE;
			var col = state ? color(0, 200, 0) : color(200, 0, 0);
			if (btn(x, y, TOOLBAR_WID - 30, 15, 'Turn ' + (state ? 'off' : 'on'), col) && mouseUp) {
				this.switchStates[idx] = !state;
				this.updates[this.uId] = true;
				mouseUp = false;
			}
		});
	}
}

class Led8 extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in7'
		}, {
			side: 0,
			lable: 'in6'
		}, {
			side: 0,
			lable: 'in5'
		}, {
			side: 0,
			lable: 'in4'
		}, {
			side: 0,
			lable: 'in3'
		}, {
			side: 0,
			lable: 'in2'
		}, {
			side: 0,
			lable: 'in1'
		}, {
			side: 0,
			lable: 'in0'
		}, ]);
		this.partName = 'Led8';
	}
	draw(skipDraw) {
		this.setWH();
		fill(255, 50);
		stroke(this.uiEnabled ? 200 : 100);
		rect(this.pos.x, this.pos.y, this.w, this.h);
		var ledSize = (this.w - 1) / 8;
		var x = this.pos.x + ledSize / 2 + 1;
		var y = this.pos.y + this.h / 2;
		noStroke();
		this.connections.forEach(conn => {
			fill(conn.state ? color(0, 255, 0) : color(0, 50, 0));
			ellipse(x, y, ledSize, ledSize);
			x += ledSize;
		});
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw());
	}
}

class Delay extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in'
		}, {
			side: 2,
			lable: 'out'
		}, {
			side: 1,
			lable: 'quick-reset'
		}]);
		this.partName = 'Delay';
		this.len = 20;
		this.timeoutIds = [];
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			this.connections.forEach(conn => conn.run());
		}
		var tId = newTimeout((obj, state) => {
			obj.connections[1].stateInp = state;
		}, this.len, [this, this.connections[0].state]);
		if (this.connections[2]) {
			this.timeoutIds.push(tId);
			if (this.connections[2].state) {
				this.timeoutIds.forEach(tId => _clearTimeout(tId));
				this.timeoutIds = [];
			}
			if (this.timeoutIds.length > this.len + 5) {
				this.timeoutIds.shift();
			}
		}
	}
	specUI(x, y) {
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Set delay') && mouseUp) {
			var t = prompt('Delay', this.len);
			var parsed = parseInt(t);
			if (!isNaN(parsed) && parsed != null) {
				this.len = parsed;
			}
			p5Instance._pInst._onmouseup();
			mouseUp = false;
		}
	}
}

class DelayFrames extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in'
		}, {
			side: 2,
			lable: 'out'
		}]);
		this.partName = 'DelayFrames';
		this.len = 20;
		this.sets = [];
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			this.connections.forEach(conn => conn.run());
		}
		this.sets.forEach(s => {
			s.t--;
			if (s.t <= 0) {
				this.connections[1].stateInp = s.state;
			}
		});
		this.sets.push({
			t: this.len,
			state: this.connections[0].state
		});
		this.sets = this.sets.filter(s => s.t > 0);
	}
	specUI(x, y) {
		y += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Set delay') && mouseUp) {
			var t = prompt('Delay', this.len);
			var parsed = parseInt(t);
			if (!isNaN(parsed) && parsed != null) {
				this.len = parsed;
			}
			p5Instance._pInst._onmouseup();
			mouseUp = false;
		}
	}
}

class ROM extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'addr7'
		}, {
			side: 0,
			lable: 'addr6'
		}, {
			side: 0,
			lable: 'addr5'
		}, {
			side: 0,
			lable: 'addr4'
		}, {
			side: 0,
			lable: 'addr3'
		}, {
			side: 0,
			lable: 'addr2'
		}, {
			side: 0,
			lable: 'addr1'
		}, {
			side: 0,
			lable: 'addr0'
		}, {
			side: 2,
			lable: 'out7'
		}, {
			side: 2,
			lable: 'out6'
		}, {
			side: 2,
			lable: 'out5'
		}, {
			side: 2,
			lable: 'out4'
		}, {
			side: 2,
			lable: 'out3'
		}, {
			side: 2,
			lable: 'out2'
		}, {
			side: 2,
			lable: 'out1'
		}, {
			side: 2,
			lable: 'out0'
		}]);
		this.partName = 'ROM';
		this.name = '';
		this.data = [];
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			if (this.name != '') {
				var rom = roms.find(r => r.name == this.name);
				if (rom) {
					this.data = rom.data;
				} else {
					this.data = [];
				}
			}
			var addr = '';
			for (var i = 0; i < 8; i++) {
				addr += this.connections[i].state ? '1' : '0';
			}
			var dOut = this.data[addr];
			if (!dOut) {
				dOut = '00000000';
			}
			dOut.split('').forEach((d, idx) => {
				this.connections[idx + 8].stateInp = d == '1';
			});
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
	}
	specUI(x, y) {
		roms.forEach(rom => {
			y += UI_Y_SPACE;
			if (btn(x, y, TOOLBAR_WID - 30, 15, rom.name)) {
				this.name = rom.name;
			}
		});
	}
}

class DecDisplay extends BasicPart {
	constructor(pos) {
		super(pos, [{
			side: 0,
			lable: 'in7'
		}, {
			side: 0,
			lable: 'in6'
		}, {
			side: 0,
			lable: 'in5'
		}, {
			side: 0,
			lable: 'in4'
		}, {
			side: 0,
			lable: 'in3'
		}, {
			side: 0,
			lable: 'in2'
		}, {
			side: 0,
			lable: 'in1'
		}, {
			side: 0,
			lable: 'in0'
		}, ]);
		this.partName = 'DecDisplay';
	}
	draw(skipDraw) {
		this.setWH();
		this.h *= 2;
		stroke(this.uiEnabled ? 200 : 100);
		noFill();
		rect(this.pos.x, this.pos.y, this.w, this.h);
		var inp = this.connections.map(c => c.state ? '1' : '0').join('');
		var digits = parseInt(inp, 2).toString();
		while (digits.length < 3) {
			digits = '0' + digits;
		}
		this.drawSegs(this.pos.x + (this.w / 3 * 0), this.pos.y, this.w / 3, this.h, digits[0]);
		this.drawSegs(this.pos.x + (this.w / 3 * 1), this.pos.y, this.w / 3, this.h, digits[1]);
		this.drawSegs(this.pos.x + (this.w / 3 * 2), this.pos.y, this.w / 3, this.h, digits[2]);
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw());
	}
	drawSegs(x, y, w, h, digit) {
		var f = function(num, idx) {
			if (SEG_TABLE[num][idx]) {
				fill(0, 255, 0);
			} else {
				fill(0, 50, 0);
			}
		};
		noStroke();
		fill(255, 0, 0);
		push();
		translate(x, y);
		var idx = 0;
		f(digit, idx++);
		rect(SEG_BUF, SEG_BUF, w - (SEG_BUF * 2), SEG_SIZE);
		f(digit, idx++);
		rect(SEG_BUF, SEG_BUF + h - (SEG_BUF * 2) - 2, w - (SEG_BUF * 2), SEG_SIZE);
		f(digit, idx++);
		rect(SEG_BUF, SEG_BUF + h / 2 - SEG_BUF, w - (SEG_BUF * 2), SEG_SIZE);
		f(digit, idx++);
		rect(SEG_BUF, SEG_BUF * 2 - 2, SEG_SIZE, h / 2 - SEG_BUF * 2 + 2);
		f(digit, idx++);
		rect(SEG_BUF + w / 3 + SEG_SIZE * 2 - 1, SEG_BUF * 2 - 2, SEG_SIZE, h / 2 - SEG_BUF * 2 + 2);
		f(digit, idx++);
		rect(SEG_BUF, h / 2 + SEG_SIZE, SEG_SIZE, h / 2 - SEG_BUF * 2);
		f(digit, idx++);
		rect(SEG_BUF + w / 3 + SEG_SIZE * 2 - 1, h / 2 + SEG_SIZE, SEG_SIZE, h / 2 - SEG_BUF * 2);
		f(digit, idx++);
		pop();
	};
}

var partList = {
	Transistor: Transistor,
	Not: Not,
	Switch: Switch,
	Button: Button,
	Led: Led,
	Junction: Junction,
	DipSwitch: DipSwitch,
	Led8: Led8,
	Delay: Delay,
	DelayFrames: DelayFrames,
	ROM: ROM,
	DecDisplay: DecDisplay
	// Rand: Rand
}