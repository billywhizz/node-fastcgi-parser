var sys = require("sys");
var fs = require("fs");
var fastcgi = require("../lib/fastcgi");

var rec = 0;
var buffers = [];
var bytes = 0;

var parser = new fastcgi.parser();
var log = fs.createReadStream(process.ARGV[2], {
	"flags": "r",
	"encoding": "binary",
	"mode": 0755,
	"bufferSize": process.ARGV[3]
});

log.addListener("data", function(buffer) {
	bytes += buffer.length;
	parser.execute(buffer);
});

log.addListener("end", function() {
	sys.puts("finished reading file");
	clearTimeout(tt);
	var now = new Date().getTime();
	sys.puts("Rec:" + (rec-lastrec) + ", Time: " + (now-then) + ", Rec/Sec: " + ((rec-lastrec)/((now-then)/1000)) + ", MBit/Sec: " + parseInt((((bytes-lastbytes)/((now-then)/1000))*8)/(1024*1024)));
});

/*  
parser.onParam = function(name, value) {

};

parser.onHeader = function(header) {

};
*/
parser.onRecord = function(record) {
	//sys.puts(JSON.stringify(record, null, "\t"));
	rec++;
};

parser.onError = function(err) {
	sys.puts("error: " + JSON.stringify(err, null, "\t"));
	throw(err);
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