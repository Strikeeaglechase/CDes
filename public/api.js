// const END_POINT = 'http://ssm3.us:8001/api/';
const END_POINT = 'http://localhost/api/';
// const END_POINT = 'http://192.168.172.1:80/api/';
var serverUIEnabled = false;
var serverDownloadMode = 'part';
var serverUIMode = 'parts';
var serverParts = [];
var roms = [];
var loading = [];

function getData(path, msg) {
	return new Promise(res => {
		$.get(END_POINT + path, msg, res);
	});
}

function uploadData(path, msg) {
	return new Promise(res => {
		$.post(END_POINT + path, JSON.stringify(msg), res);
	});
}

async function enableServerUI(mode) {
	serverUIEnabled = true;
	serverUIMode = mode;
	serverParts = await getData('parts');
	roms = await getData('getRomData');
	truthTables = await getData('tables');
}

async function loadPart(part, mode) {
	var existingParts = Object.getOwnPropertyNames(partList);
	console.log('Loading %s, needed deps: %s', part.name, part.needed.filter(p => !existingParts.includes(p)).join(', '));
	if (!loading.includes(part.name)) {
		loading.push(part.name);
		part.needed.forEach(neededPartName => {
			if (neededPartName == part.name) {
				console.log('Cyclic dependency: %s needs %s', neededPartName, neededPartName);
				return;
			}
			if (!existingParts.includes(neededPartName)) {
				var neededPart = serverParts.find(p => p.name == neededPartName);
				if (!neededPart) {
					console.log('Error loading %s', neededPartName);
					return;
				}
				loadPart(neededPart, 'part');
			}
		});
	}
	if (mode == 'part') {
		createNewCustomPart(part);
	} else {
		parts = parts.concat(loadPartData(part));
	}
}

function runServerUI(x, y) {
	if (btn(x, y, TOOLBAR_WID - 30, 15, 'Load for ' + (serverDownloadMode == 'part' ? 'editing' : 'part')) && mouseUp) {
		serverDownloadMode = serverDownloadMode == 'part' ? 'editing' : 'part';
		mouseUp = false;
	}
	y += UI_Y_SPACE * 2;
	serverParts.forEach(part => {
		if (btn(x, y, TOOLBAR_WID - 30, 15, part.name) && mouseUp) {
			loadPart(part, serverDownloadMode);
			mouseUp = false;
		}
		y += UI_Y_SPACE;
	});
}