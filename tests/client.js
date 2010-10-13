var sys = require("sys");
var net = require("net");
var fastcgi = require("../lib/fastcgi");

var params = [
	["SCRIPT_FILENAME", "/test.js"],
	["HTTP_USER_AGENT", "tester"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];

var reqid = 0;

function sendRequest(connection) {
	reqid++;
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_BEGIN,
		"recordId": reqid,
		"contentLength": 8,
		"paddingLength": 0
	});
	connection.writer.writeBegin({
		"role": fastcgi.constants.role.FCGI_RESPONDER,
		"flags": fastcgi.constants.keepalive.ON
	});
	connection.write(connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": reqid,
		"contentLength": fastcgi.getParamLength(params),
		"paddingLength": 0
	});
	connection.writer.writeParams(params);
	connection.write(connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": reqid,
		"contentLength": 0,
		"paddingLength": 0
	});
	connection.write(connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDIN,
		"recordId": reqid,
		"contentLength": 5,
		"paddingLength": 0
	});
	connection.writer.writeBody("hello");
	connection.write(connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDIN,
		"recordId": reqid,
		"contentLength": 0,
		"paddingLength": 0
	});
	connection.write(connection.writer.tobuffer());
}

var count = 0;
var recordId = 0;

var connection = new net.Stream();
connection.setNoDelay(true);
connection.setTimeout(0);

connection.ondata = function (buffer, start, end) {
	connection.parser.execute(buffer.slice(start, end));
};

connection.addListener("connect", function() {
	connection.writer = new fastcgi.writer();
	connection.parser = new fastcgi.parser();
	connection.parser.addListener("record", function(record) {
		recordId = record.header.recordId;
		count++;
		if(record.header.type == fastcgi.constants.record.FCGI_END) {
			sendRequest(connection);
		}
	});
	connection.parser.addListener("error", function(err) {
		sys.puts(JSON.stringify(err, null, "\t"));
	});
	sendRequest(connection);
});

connection.addListener("timeout", function() {
	connection.end();
});

connection.addListener("close", function() {
	connection.end();
});

connection.addListener("error", function(exception) {
	sys.puts(JSON.stringify(exception));
});

connection.connect("/tmp/nginx.sock");

var then = new Date().getTime();	
var last = 0;
setInterval(function() {
	var now = new Date().getTime();
	var elapsed = now - then;
	var rps = count - last;
	sys.puts("Record: " + recordId + ", Count: " + count + ", RPS: " + rps/(elapsed/1000));
	then = new Date().getTime();
	last = count;
}, 1000);
