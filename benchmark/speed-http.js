var sys = require("sys");
var fs = require("fs");
var HTTPParser = process.binding("http_parser").HTTPParser;

var rec = 0;
var buffers = [];
var bytes = 0;

var parser = new HTTPParser(process.ARGV[4]);
var log = fs.createReadStream(process.ARGV[2], {
	"flags": "r",
	"encoding": null,
	"mode": 0755,
	"bufferSize": parseInt(process.ARGV[3] * 1024)
});

log.addListener("data", function(buffer) {
	bytes += buffer.length;
	parser.execute(buffer, 0, buffer.length);
});

log.addListener("end", function() {
	sys.puts("finished reading file");
	clearTimeout(tt);
	sys.puts("total records: " + rec);
});
  
parser.onMessageBegin = function () {
	parser.incoming = {
		"headers": [],
		"body": ""
	};
};

parser.onURL = function (b, start, len) {
	var slice = b.toString('ascii', start, start+len);
	if (parser.incoming.url) {
		parser.incoming.url += slice;
	} else {
		parser.incoming.url = slice;
	}
};

parser.onHeaderField = function (b, start, len) {
	var slice = b.toString('ascii', start, start+len).toLowerCase();
	if (parser.value != undefined) {
		parser.incoming.headers.push({"name": parser.field, "value": parser.value});
		parser.field = null;
		parser.value = null;
	}
	if (parser.field) {
		parser.field += slice;
	} else {
		parser.field = slice;
	}
};

parser.onHeaderValue = function (b, start, len) {
	var slice = b.toString('ascii', start, start+len);
	if (parser.value) {
		parser.value += slice;
	} else {
		parser.value = slice;
	}
};

parser.onHeadersComplete = function (info) {
	if (parser.field && (parser.value != undefined)) {
		parser.incoming.headers.push({"name": parser.field, "value": parser.value});
	}
	parser.incoming.info = info;
};

parser.onBody = function (b, start, len) {
	parser.incoming.body += b.toString("utf8", start, start + len);
};

parser.onMessageComplete = function () {
	//sys.puts(JSON.stringify(parser.incoming, null, "\t"));
	rec++;
};

var lastrec = 0;
var then = new Date().getTime();
var lastbytes = 0;

var tt = setInterval(function() {
	var now = new Date().getTime();
	sys.puts("Rec:" + (rec-lastrec) + ", Time: " + (now-then) + ", Rec/Sec: " + ((rec-lastrec)/((now-then)/1000)) + ", MBit/Sec: " + parseInt((((bytes-lastbytes)/((now-then)/1000))*8)/(1024*1024)));
	then = now;
	lastrec = rec;
	lastbytes = bytes;
}, 1000)