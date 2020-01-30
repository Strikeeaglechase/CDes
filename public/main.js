// const CAM_SPEED = -5;
const TOOLBAR_WID = 150;
const UI_Y_SPACE = 20;
var gui, p5Instance;
var keys = [];
var parts = [];
var buttonSpacer = 10;
var mouseUp = true;
var simSpeed = 5;
var zoomLvl = 1;
var offX = 0;
var offY = 0;
var transRate = -5;
var zoomRate = 0.1;
var mX, mY;
const msPerFrame = 1000 / 60;
var timeouts = [];
var calcs = 0;
var toolbarOffset = 0;

function k(letter) {
	return keys[letter.toUpperCase().charCodeAt(0)];
}

function btn(x, y, w, h, txt, col) {
	if (!txt) {
		txt = '';
	}
	var needW = textWidth(txt);
	var acW = max(w, needW + buttonSpacer);
	fill(col || 0);
	rect(x, y, acW, h);
	fill(255);
	text(txt, x + 5, y + h / 2 + 4);
	if (mouseX > x && mouseX < x + acW && mouseY > y && mouseY < y + h) {
		if (mouseIsPressed) {
			fill(0, 255, 0, 100);
			rect(x, y, acW, h);
			return true;
		} else {
			fill(0, 100);
			rect(x, y, acW, h);
			return false;
		}
	}
}

function screenToWorld(x, y) {
	return {
		x: (x - offX) / zoomLvl,
		y: (y - offY) / zoomLvl
	};
}

function worldToScreen(x, y) {
	return {
		x: (x * zoomLvl) + offX,
		y: (y * zoomLvl) + offY
	}
}

function setup() {
	p5Instance = createCanvas(windowWidth, windowHeight);
	p5Instance.canvas.oncontextmenu = function(e) {
		e.preventDefault();
	};
	$.ajaxSetup({
		contentType: "application/json; charset=utf-8"
	});
	angleMode(DEGREES);
	parts = [];
}

function getPartData(name) {
	var names = [];
	for (var i in partList) {
		var isSubDep = parts.some(part => {
			return part.isCustomPart && part.parts.some(p => p.partName == i);
		});
		if (parts.some(p => p.partName == i) || isSubDep) {
			names.push(i);
		}
	}
	var partData = parts.map(part => {
		var conns = part.connections.map(conn => {
			return {
				side: conn.side,
				lable: conn.lable,
				id: conn.id,
				connectedTo: conn.connectedTo ? {
					id: conn.connectedTo.id
				} : undefined
			}
		});
		return {
			pos: {
				x: part.pos.x,
				y: part.pos.y
			},
			name: part.name,
			id: part.id,
			connections: conns,
			len: part.len,
			truthTableEnabled: part.truthTableEnabled,
			partName: part.partName,
			toggleRate: part.toggleRate
		}
	});
	return {
		parts: partData,
		name: name,
		window: {
			wid: windowWidth,
			hei: windowHeight
		},
		needed: names
	};
}

function runToolbar() {
	noStroke();
	fill(255, 50);
	rect(windowWidth - TOOLBAR_WID * uiSizeMult, 0, TOOLBAR_WID * uiSizeMult, windowHeight);
	parts.forEach(part => {
		if (part.isPointIn(mX, mY) && mouseIsPressed) {
			parts.forEach(p => {
				p.disableUI()
			});
			serverUIEnabled = false;
			part.enableUI();
		}
	})
	rect(0, 0, TOOLBAR_WID, windowHeight);
	var x = 15;
	var y = 15 + toolbarOffset;
	for (var i in partList) {
		if (btn(x, y, TOOLBAR_WID - x - 15, 15, i) && mouseUp && !specUIActive) {
			parts.forEach(p => p.disableUI());
			serverUIEnabled = false;
			var newPart = new partList[i]({
				x: 100,
				y: 100
			}, {
				name: i
			});
			newPart.enableUI();
			newPart.UIState = 'partMove';
			parts.push(newPart);
			mouseUp = false;
		}
		y += UI_Y_SPACE;
	}
	y += UI_Y_SPACE;
	if (btn(x, y, TOOLBAR_WID - x - 15, 15, 'Save part') && mouseUp) {
		p5Instance._pInst._onmouseup();
		var name = prompt('Enter a part name');
		if (name) {
			var data = getPartData(name);
			uploadData('savePart', data);
		}
	}
	y += UI_Y_SPACE;
	if (btn(x, y, TOOLBAR_WID - x - 15, 15, 'Load part') && mouseUp) {
		parts.forEach(part => part.disableUI());
		if (!partHasUIEnabled) {
			enableServerUI();
		}
		mouseUp = false;
	}
	y += UI_Y_SPACE;
	if (btn(x, y, TOOLBAR_WID - x - 15, 15, 'Delete part') && mouseUp) {
		p5Instance._pInst._onmouseup();
		var name = prompt('Enter a part name');
		if (name) {
			uploadData('deletePart', {
				name: name
			});
		}
		mouseUp = false;
	}
	y += UI_Y_SPACE * 2;
	if (btn(x, y, TOOLBAR_WID - x - 15, 15, 'Save ROM') && mouseUp) {
		p5Instance._pInst._onmouseup();
		var name = prompt('Name');
		var strData = prompt('Data');
		var data;
		try {
			data = JSON.parse(strData);
		} catch (e) {}
		if (name && data) {
			uploadData('romData', {
				name: name,
				data: data
			});
		}
		mouseUp = false;
	}
}

function moveCam() {
	if (keys[38]) {
		offY -= transRate;
	}
	if (keys[40]) {
		offY += transRate;
	}
	if (keys[37]) {
		offX -= transRate;
	}
	if (keys[39]) {
		offX += transRate;
	}
}

function _clearTimeout(id) {
	timeouts = timeouts.filter(t => t.id != id);
}

function newTimeout(func, time, args) {
	var id = genID();
	timeouts.push({
		time: Math.ceil(time / msPerFrame),
		func: func,
		args: args,
		id: id
	});
	return id;
}

function runTimeouts() {
	timeouts.forEach(t => {
		t.time--;
		if (t.time == 0) {
			t.func.apply(null, t.args);
			t.delete = true;
		}
	});
	timeouts = timeouts.filter(t => !t.delete);
}

function draw() {
	background(0);
	calcs = 0;
	moveCam();
	runTimeouts();
	push();
	translate(offX, offY);
	scale(zoomLvl);
	var pos = screenToWorld(mouseX, mouseY);
	mX = pos.x;
	mY = pos.y;
	for (var i = 0; i < simSpeed; i++) {
		parts.forEach(part => part.run(i != 0));
	}
	parts = parts.filter(part => !part.deleted);
	pop();

	runToolbar();
	var uiPart = parts.find(part => part.uiEnabled);
	if (uiPart) {
		uiPart.runUI(windowWidth - (TOOLBAR_WID * uiSizeMult) + 15, 15);
	}
	if (serverUIEnabled) {
		runServerUI(windowWidth - TOOLBAR_WID + 15, 25 + toolbarOffset);
	}
	fill(255);
	noStroke();
	text('Preformance value: ' + calcs, 15, 12);
	if (btn(TOOLBAR_WID + 10, 5, textWidth('Trigger Update  '), 15, 'Trigger Update')) {
		for (var i in updates) {
			updates[i] = true;
		}
	}
}

function keyPressed() {
	if (!keys[68] && partHasUIEnabled && keyCode == 68) {
		var uiPart = parts.find(part => part.uiEnabled);
		var partConstructor = uiPart.constructor;
		var name = uiPart.partName;
		parts.forEach(p => p.disableUI());
		serverUIEnabled = false;
		var newPart = new partConstructor({
			x: 100,
			y: 100
		}, {
			name: name
		});
		newPart.enableUI();
		newPart.UIState = 'partMove';
		parts.push(newPart);
	}
	keys[keyCode] = true;
	if (keys[8] && partHasUIEnabled && confirm('Are you sure?')) {
		var uiPart = parts.find(part => part.uiEnabled);
		uiPart.delete();
		keys[8] = false;
	}
	if (keys[187]) {
		zoomLvl += zoomRate;
	}
	if (keys[189]) {
		zoomLvl -= zoomRate;
	}
	if (keys[48]) {
		zoomLvl = 1;
		offX = 0;
		offY = 0;
		toolbarOffset = 0;
	}
}

function keyReleased() {
	keys[keyCode] = false;
}

function mousePressed() {
	parts.forEach(part => {
		part.onMousePressed(mouseButton);
	});
}

function mouseDragged() {
	parts.forEach(part => {
		part.onMouseDragged();
	});
}

function mouseReleased() {
	mouseUp = true;
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
}

function mouseWheel(e) {
	toolbarOffset -= e.delta / 10;
}