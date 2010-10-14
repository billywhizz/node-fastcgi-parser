var sys = require("sys");
var fastcgi = require("../lib/fastcgi");
var fs = require("fs");

var parser = new fastcgi.parser();

parser.addListener("param", function(name, value) {
	sys.puts("param\n" + name + ":" + value);
});

parser.addListener("header", function(header) {
	sys.puts("header\n" + JSON.stringify(header, null, "\t"));
});

parser.addListener("record", function(record) {
	sys.puts("record\n" + JSON.stringify(record, null, "\t"));
});

parser.addListener("error", function(err) {
	sys.puts("error\n" + JSON.stringify(err, null, "\t"));
	throw(err);
});

var writer = new fastcgi.writer();

var message = "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 5\r\nContent-Type: text/plain\r\n\r\nhello";

// out parser
writer.writeHeader({
	"version": 1,
	"type": 6,
	"recordId": 1,
	"contentLength": message.length,
	"paddingLength": 0
});
writer.writeBody(message);
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 6,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 3,
	"recordId": 1,
	"contentLength": 8,
	"paddingLength": 0
});
writer.writeEnd({
	"status": 0,
	"protocolStatus": 200
});
parser.execute(writer.tobuffer());

var maxbuff = "";
for(var i=0; i<16231; i++) {
	maxbuff += "0";
}
maxbuff = "hello";

var params = [
	["SCRIPT_FILENAME", "/scripts/test.js"],
	["HTTP_USER_AGENT", maxbuff],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];

// in parser
writer.writeHeader({
	"version": 1,
	"type": 1,
	"recordId": 1,
	"contentLength": 8,
	"paddingLength": 0
});
writer.writeBegin({
	"role": 1,
	"flags": 0
});
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 4,
	"recordId": 1,
	"contentLength": fastcgi.getParamLength(params),
	"paddingLength": 0
});
writer.writeParams(params);
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 4,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 5,
	"recordId": 1,
	"contentLength": 5,
	"paddingLength": 0
});
writer.writeBody("hello");
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": 1,
	"type": 5,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());