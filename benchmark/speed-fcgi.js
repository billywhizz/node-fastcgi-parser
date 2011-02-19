var fs = require("fs");
var fastcgi = require("../lib/fastcgi");

var rec = 0;
var buffers = [];
var bytes = 0;

var parser = new fastcgi.parser();
var mode = process.ARGV[2];

var log = fs.createReadStream("fastcgi." + mode, {
	"flags": "r",
	"encoding": null,
	"mode": 0755,
	"bufferSize": parseInt(process.ARGV[3]) * 1024
});

log.addListener("data", function(buff) {
	bytes += buff.length;
	parser.execute(buff);
});

log.addListener("end", function() {
	console.log("finished reading file");
	clearTimeout(tt);
	var now = new Date().getTime();
	console.log("Rec:" + (rec-lastrec) + ", Time: " + (now-then) + ", Rec/Sec: " + ((rec-lastrec)/((now-then)/1000)) + ", MBit/Sec: " + parseInt((((bytes-lastbytes)/((now-then)/1000))*8)/(1024*1024)));
	console.log("total: " + rec);
});

var FCGI_END = fastcgi.constants.record.FCGI_END;
var FCGI_STDIN = fastcgi.constants.record.FCGI_STDIN;

parser.onRecord = function(record) {
	if(((mode == "out") && (record.header.type == FCGI_END))) {
		rec++;
	}
	else if(((mode == "in") && (record.header.type == FCGI_STDIN) && record.header.contentLength == 0)) {
		rec++;
	}
};

parser.onError = function(err) {
	console.log("error: " + JSON.stringify(err, null, "\t"));
	throw(err);
};

var lastrec = 0;
var then = new Date().getTime();
var lastbytes = 0;

var tt = setInterval(function() {
	var now = new Date().getTime();
	console.log("Rec:" + (rec-lastrec) + ", Time: " + (now-then) + ", Rec/Sec: " + ((rec-lastrec)/((now-then)/1000)).toFixed(0) + ", MBit/Sec: " + parseInt((((bytes-lastbytes)/((now-then)/1000))*8)/(1024*1024)));
	then = now;
	lastrec = rec;
	lastbytes = bytes;
}, 1000)
