const SIZE_PER_CONNECTION = 10;
const MIN_SIZE = 25;
const SNAP_CUTOFF = 50;
const SNAP_MULTI = 10;
var uiSizeMult = 1;
var pId = 0;
var partHasUIEnabled = false;
var specUIActive = false;

function genID() {
	return Math.floor(Math.random() * 1e16);
}

function findNumber(str) {
	if (!str) {
		return undefined;
	}
	var idxs = str.split('').map((char, idx) => !isNaN(parseInt(char)) ? idx : -1);
	return idxs.filter(val => val != -1).sort()[0];
}

function detectBus(conns) {
	var existingNames = [];
	var bus = [];
	conns.forEach(conn => {
		var numIdx = findNumber(conn.lable);
		if (numIdx > 0) {
			var busName = conn.lable.substring(0, numIdx);
			if (existingNames.includes(busName)) {
				bus[busName].push(conn);
			} else {
				bus[busName] = [conn];
				existingNames.push(busName);
			}
		}
	});
	return bus;
}

class BasicPart {
	constructor(pos, conns) {
		this.pos = pos;
		this.w = 0;
		this.h = 0;
		this.deleted = false;
		this.sideConnCounts = [0, 0, 0, 0];
		this._sideCounts = [0, 0, 0, 0];
		this.connections = [];
		this.uiEnabled = false;
		this.UIState = 'none';
		this.connToSet = undefined;
		this.toConnTo = undefined;
		this.busToSet = undefined;
		this.prefVal = 0;
		this.id = genID();
		this.uId = pId++;
		this.initConnections(conns);
		updates[this.uId] = true;
	}
	initConnections(conns) {
		this.connections = [];
		this.sideConnCounts = [0, 0, 0, 0];
		conns.forEach(conn => {
			this.sideConnCounts[conn.side]++;
			this.connections.push(new Connection(conn, this));
		});
	}
	draw() {
		this.setWH();
		fill(255, 50);
		stroke(this.uiEnabled ? 200 : 100);
		rect(this.pos.x, this.pos.y, this.w, this.h);
		this._sideCounts = [0, 0, 0, 0];
		this.connections.forEach(conn => conn.draw());
	}
	run(skipDraw) {
		if (!skipDraw) {
			this.draw();
		}
		if (updates[this.uId]) {
			updates[this.uId] = false;
			this.connections.forEach(conn => conn.run());
		}
	}
	runUI(x, y) {
		const initY = y;
		var totalY = y;
		specUIActive = this.UIState != 'none';
		noStroke();
		fill(255);
		text(this.partName + ' | ' + this.prefVal, x, y - 5);
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Move part')) {
			this.UIState = 'partMove';
		}
		y += UI_Y_SPACE;
		totalY += UI_Y_SPACE;
		if (btn(x, y, TOOLBAR_WID - 30, 15, 'Delete part') && confirm('Are you sure?')) {
			p5Instance._pInst._onmouseup();
			this.delete();
		}
		if (this.connections.length > 7 && this.UIState == 'none') {
			y += UI_Y_SPACE;
			totalY += UI_Y_SPACE;
			var bus = detectBus(this.connections);
			for (var i in bus) {
				if (btn(x, y, TOOLBAR_WID - 30, 15, 'Bus: ' + i) && mouseUp) {
					this.UIState = 'connAddBus';
					this.busToSet = bus[i];
					mouseUp = false;
				}
				y += UI_Y_SPACE;
			}
		}
		y += UI_Y_SPACE * (this.connections.length > 7 && this.UIState == 'none' ? 1 : 2);
		if (this.UIState == 'connAdd2') {
			this.toConnTo.connections.forEach(conn => {
				if (btn(x, y, TOOLBAR_WID - 30, 15, conn.lable) && mouseUp) {
					conn.connectedTo = this.connToSet;
					this.connToSet.connectedTo = conn;
					this.UIState = 'none';
					this.connToSet = undefined;
					mouseUp = false;
				}
				y += UI_Y_SPACE;
				if (y > windowHeight - 25) {
					y = initY;
					x += TOOLBAR_WID;
				}
				totalY += UI_Y_SPACE;
			});
		} else if (this.UIState == 'connAdd2Bus') {
			var avalBus = detectBus(this.toConnTo.connections);
			for (var i in avalBus) {
				if (btn(x, y, TOOLBAR_WID - 30, 15, 'Bus: ' + i) && mouseUp) {
					this.busToSet.sort((a, b) => a.lable > b.lable);
					avalBus.sort((a, b) => a.lable > b.lable);
					this.busToSet.forEach((conn, idx) => {
						conn.connectedTo = avalBus[i][idx];
						avalBus[i][idx].connectedTo = conn;
					});
					this.UIState = 'none';
					mouseUp = false;
				}
				y += UI_Y_SPACE;
				totalY += UI_Y_SPACE;
			}
		} else {
			this.connections.forEach(conn => {
				if (btn(x, y, TOOLBAR_WID - 30, 15, conn.lable) && this.UIState == 'none' && mouseUp) {
					this.UIState = 'connAdd';
					this.connToSet = conn;
					mouseUp = false;
				}
				y += UI_Y_SPACE;
				if (y > windowHeight - 25) {
					y = initY;
					x += TOOLBAR_WID;
				}
				totalY += UI_Y_SPACE;
			});
		}
		if (this.UIState == 'partMove' || this.UIState == 'drag') {
			this.movePart();
		} else if (this.UIState == 'connAdd' || this.UIState == 'connAddBus') {
			stroke(255);
			var pos = this.connToSet ? this.connToSet.pos : {
				x: this.w / 2,
				y: this.h / 2
			};
			var endPos = worldToScreen(pos.x + this.pos.x, pos.y + this.pos.y);
			line(endPos.x, endPos.y, mouseX, mouseY);
		}
		uiSizeMult = totalY > windowHeight - 120 ? 2 : 1;
		this.specUI(x, y);
	}
	movePart() {
		if (keys[16] && parts.length > 1) {
			var snapPtsX = [];
			var snapPtsY = [];
			parts.forEach(part => {
				if (part.id != this.id) {
					var dx = Math.abs(mX - (part.pos.x + part.w / 2));
					var dy = Math.abs(mY - (part.pos.y + part.h / 2));
					if (dx < SNAP_CUTOFF) {
						snapPtsX.push({
							val: part.pos.x + part.w / 2,
							d: dx,
							type: 'X'
						});
					}
					if (dy < SNAP_CUTOFF) {
						snapPtsY.push({
							val: part.pos.y + part.h / 2,
							d: dy,
							type: 'Y'
						});
					}
				}
			});
			snapPtsX.sort((a, b) => a.d - b.d);
			snapPtsY.sort((a, b) => a.d - b.d);
			var choosenX;
			var choosenY;
			if (snapPtsX.length && snapPtsY.length) {
				if (snapPtsX[0].d < SNAP_MULTI && snapPtsY[0].d < SNAP_MULTI) {
					choosenX = snapPtsX[0];
					choosenY = snapPtsY[0];
				} else if (snapPtsX[0].d < snapPtsY[0].d) {
					choosenX = snapPtsX[0];
				} else {
					choosenY = snapPtsY[0];
				}
			} else if (snapPtsX.length) {
				choosenX = snapPtsX[0];
			} else if (snapPtsY.length) {
				choosenY = snapPtsY[0];
			}
			stroke(0, 50, 200);
			if (choosenX) {
				this.pos.x = choosenX.val - this.w / 2;
				if (!choosenY) {
					this.pos.y = mY - this.h / 2;
				}
				var p = worldToScreen(choosenX.val, 0).x;
				line(p, 0, p, windowHeight);
			}
			if (choosenY) {
				if (!choosenX) {
					this.pos.x = mX - this.w / 2;
				}
				this.pos.y = choosenY.val - this.h / 2;
				var p = worldToScreen(0, choosenY.val).y;
				line(0, p, windowWidth, p);
			}
			if (!choosenX && !choosenY) {
				this.pos.x = mX - this.w / 2;
				this.pos.y = mY - this.h / 2;
			}
		} else {
			this.pos.x = mX - this.w / 2;
			this.pos.y = mY - this.h / 2;
		}
		if (!mouseIsPressed && this.UIState == 'drag') {
			this.UIState = 'none';
		}
	}
	specUI() {}
	setWH() {
		this.w = Math.max(this.sideConnCounts[0] * SIZE_PER_CONNECTION, this.sideConnCounts[2] * SIZE_PER_CONNECTION);
		this.h = Math.max(this.sideConnCounts[1] * SIZE_PER_CONNECTION, this.sideConnCounts[3] * SIZE_PER_CONNECTION);
		this.w = Math.max(this.w, MIN_SIZE);
		this.h = Math.max(this.h, MIN_SIZE);
	}
	delete() {
		if (this.UIState != 'none') {
			return;
		}
		this.disableUI();
		this.connections.forEach(connection => {
			if (connection.connectedTo) {
				connection.connectedTo.connectedTo = undefined;
			}
		});
		this.deleted = true;
	}
	isPointIn(x, y) {
		return x > this.pos.x && y > this.pos.y && x < this.pos.x + this.w && y < this.pos.y + this.h;
	}
	enableUI() {
		if (!partHasUIEnabled) {
			this.uiEnabled = true;
			this.UIState = 'none';
			partHasUIEnabled = true;
		}
	}
	disableUI() {
		if (this.UIState == 'none' && this.uiEnabled) {
			this.uiEnabled = false;
			partHasUIEnabled = false;
		}
	}
	onMousePressed(mBtn) {
		if (this.UIState == 'partMove' && mBtn == LEFT) {
			this.UIState = 'none';
		}
		if (this.UIState == 'connAdd' || this.UIState == 'connAddBus') {
			if (mBtn == LEFT) {
				parts.forEach(part => {
					if (part.isPointIn(mX, mY) && part.id != this.id) {
						this.toConnTo = part;
						this.UIState = this.UIState == 'connAdd' ? 'connAdd2' : 'connAdd2Bus';
					}
				});
			} else {
				if (this.UIState == 'connAdd') {
					if (this.connToSet.connectedTo) {
						this.connToSet.connectedTo.connectedTo = undefined;
						this.connToSet.connectedTo = undefined;
					}
				}
				this.UIState = 'none';
			}
		}
	}
	onMouseDragged() {
		if (this.uiEnabled && this.isPointIn(mX, mY) && this.UIState == 'none') {
			this.UIState = 'drag';
		}
	}
}

class Connection {
	constructor(opts, object) {
		this.owner = object;
		this.side = opts.side;
		this.lable = opts.lable;
		this.connectedTo = undefined;
		this.stateInp = false;
		this.state = false;
		this.lastState = false;
		this.id = genID();
		this.pos = {
			x: 0,
			y: 0
		};
	}
	draw() {
		this.updatePos();
		noFill();
		stroke(150);
		ellipse(this.owner.pos.x + this.pos.x, this.owner.pos.y + this.pos.y, 5, 5);
		if (this.connectedTo) {
			stroke(this.state ? color(0, 255, 0) : color(255, 0, 0));
			var x1 = this.owner.pos.x + this.pos.x;
			var y1 = this.owner.pos.y + this.pos.y;
			var x2 = this.connectedTo.owner.pos.x + this.connectedTo.pos.x;
			var y2 = this.connectedTo.owner.pos.y + this.connectedTo.pos.y;
			line(x1, y1, x2, y2);
		}
	}
	run() {
		if (trackCalcs) {
			calcs++;
		}
		if (this.connectedTo) {
			this.state = this.stateInp || this.connectedTo.stateInp;
		} else {
			this.state = false;
		}
		if (this.state != this.lastState) {
			updates[this.owner.uId] = true;
			if (this.connectedTo) {
				updates[this.connectedTo.owner.uId] = true;
			}
			this.lastState = this.state;
		}
	}
	updatePos() {
		this.owner._sideCounts[this.side]++;
		var halfSize = SIZE_PER_CONNECTION / 2;
		var topW = this.owner._sideCounts[0] * SIZE_PER_CONNECTION;
		var bottemW = this.owner._sideCounts[2] * SIZE_PER_CONNECTION;
		var leftH = this.owner._sideCounts[3] * SIZE_PER_CONNECTION;
		var rightH = this.owner._sideCounts[1] * SIZE_PER_CONNECTION;
		switch (this.side) {
			case 0:
				this.pos = {
					x: topW - halfSize + 5,
					y: 0
				}
				break;
			case 1:
				this.pos = {
					x: this.owner.w,
					y: rightH - halfSize
				}
				break;
			case 2:
				this.pos = {
					x: bottemW - halfSize,
					y: this.owner.h
				}
				break;
			case 3:
				this.pos = {
					x: 0,
					y: leftH - halfSize + 5
				}
				break;
		}
	}
}