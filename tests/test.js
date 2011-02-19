var fastcgi = require("../lib/fastcgi");
var fs = require("fs");

var parser = new fastcgi.parser();
parser.encoding = "binary";
parser.onParam = function(name, value) {
	console.log("param\n" + name + ":" + value);
};

parser.onHeader = function(header) {
	console.log("header\n" + JSON.stringify(header, null, "\t"));
};

parser.onRecord = function(record) {
	console.log("record\n" + JSON.stringify(record, null, "\t"));
};

parser.onError = function(err) {
	console.log("error\n" + JSON.stringify(err, null, "\t"));
	throw(err);
};

parser.onBody = function(buffer, start, end) {
	console.log("chunk: " + (end-start));
};

var writer = new fastcgi.writer();
writer.encoding = "utf8";
//TODO: test encodings
var message = "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 5\r\nContent-Type: text/plain\r\n\r\nhello";

// out parser
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_STDOUT,
	"recordId": 1,
	"contentLength": message.length,
	"paddingLength": 0
});
writer.writeBody(message);
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_STDOUT,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_END,
	"recordId": 1,
	"contentLength": 8,
	"paddingLength": 0
});
writer.writeEnd({
	"status": 0,
	"protocolStatus": 200
});
parser.execute(writer.tobuffer());

var params = [
	["SCRIPT_FILENAME", "/test.js"],
	["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];

var paramlen = fastcgi.getParamLength(params);
// in parser
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_BEGIN,
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
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_PARAMS,
	"recordId": 1,
	"contentLength": paramlen,
	"paddingLength": 0
});
writer.writeParams(params);
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_PARAMS,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_STDIN,
	"recordId": 1,
	"contentLength": 5,
	"paddingLength": 0
});
writer.writeBody("hello");
parser.execute(writer.tobuffer());
writer.writeHeader({
	"version": fastcgi.constants.version,
	"type": fastcgi.constants.record.FCGI_STDIN,
	"recordId": 1,
	"contentLength": 0,
	"paddingLength": 0
});
parser.execute(writer.tobuffer());