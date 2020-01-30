const express = require('express');
const fs = require('fs');
const app = express();
const port = 80;

function genID() {
	return Math.floor(Math.random() * 1e16);
}

app.use(express.static('public'));
app.use(express.json({
	limit: '10MB'
}));
const router = express.Router();
router.get('/parts', function(req, res) {
	var data = JSON.parse(fs.readFileSync('parts.json', 'utf8'));
	res.json(data);
});

router.get('/parts/:partId', async function(req, res) {
	var data = JSON.parse(fs.readFileSync('parts.json', 'utf8'));
	var part = data.find(part => part.id == req.params.partId);
	await new Promise(res => setTimeout(res, 500));
	res.json(part);
});

router.post('/deletePart', function(req, res) {
	var parts = JSON.parse(fs.readFileSync('parts.json', 'utf8'));
	var name = req.body.name;
	if (!name) {
		res.send(500);
		return;
	}
	var partTODelete = parts.find(part => part.name == name);
	if (partTODelete) {
		var deletedParts = JSON.parse(fs.readFileSync('deleted.json', 'utf8'));
		deletedParts.push(partTODelete);
		parts = parts.filter(p => p.name != name);
		fs.writeFileSync('parts.json', JSON.stringify(parts));
		fs.writeFileSync('deleted.json', JSON.stringify(deletedParts));
	}
});

router.post('/romData', function(req, res) {
	var data = req.body;
	var roms = JSON.parse(fs.readFileSync('rom.json', 'utf8'));
	roms = roms.filter(r => r.name != data.name);
	roms.push(data);
	fs.writeFileSync('rom.json', JSON.stringify(roms));
	res.sendStatus(200);
});

router.get('/getRomData', function(req, res) {
	var roms = JSON.parse(fs.readFileSync('rom.json', 'utf8'));
	res.json(roms);
});

router.post('/table', function(req, res) {
	var tables = JSON.parse(fs.readFileSync('tables.json', 'utf8'));
	var reqData = req.body;
	tables[reqData.name] = reqData.data;
	fs.writeFileSync('tables.json', JSON.stringify(tables));
	res.sendStatus(200);
});

router.get('/tables', function(req, res) {
	var tables = JSON.parse(fs.readFileSync('tables.json', 'utf8'));
	res.json(tables);
});

router.post('/savePart', function(req, res) {
	var existingParts = JSON.parse(fs.readFileSync('parts.json', 'utf8'));
	var existingIdx = -1;
	var newPart = req.body;
	existingParts.forEach((part, idx) => {
		if (part.name == newPart.name) {
			existingIdx = idx;
		}
	})
	newPart.id = genID();
	if (existingIdx == -1) {
		existingParts.push(newPart);
	} else {
		existingParts[existingIdx] = newPart;
	}
	fs.writeFileSync('parts.json', JSON.stringify(existingParts))
	res.sendStatus(200);
});

app.use('/api', router);
app.listen(port);
console.log('API server started on: ' + port);