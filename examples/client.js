var net = require("net");
var fastcgi = require("../lib/fastcgi");

var params = [
	["SCRIPT_FILENAME", "/test.js"],
	["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];

var bytesin = 0;
var bytesout = 0;
var reqid = 0;

function writeSocket(socket, buffer) {
	bytesout += buffer.length;
	socket.write(buffer);
}

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
	writeSocket(connection, connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": reqid,
		"contentLength": fastcgi.getParamLength(params),
		"paddingLength": 0
	});
	connection.writer.writeParams(params);
	writeSocket(connection, connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": reqid,
		"contentLength": 0,
		"paddingLength": 0
	});
	writeSocket(connection, connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDIN,
		"recordId": reqid,
		"contentLength": 5,
		"paddingLength": 0
	});
	connection.writer.writeBody("hello");
	writeSocket(connection, connection.writer.tobuffer());
	connection.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDIN,
		"recordId": reqid,
		"contentLength": 0,
		"paddingLength": 0
	});
	writeSocket(connection, connection.writer.tobuffer());
}

var count = 0;
var recordId = 0;

var connection = new net.Stream();
connection.setNoDelay(true);
connection.setTimeout(0);

connection.ondata = function (buffer, start, end) {
	bytesin += (end-start);
	connection.parser.execute(buffer.slice(start, end));
};

connection.addListener("connect", function() {
	connection.writer = new fastcgi.writer();
	connection.parser = new fastcgi.parser();
	connection.parser.onRecord = function(record) {
		recordId = record.header.recordId;
		count++;
		if(record.header.type == fastcgi.constants.record.FCGI_END) {
			sendRequest(connection);
		}
	};
	connection.parser.onError = function(err) {
		console.log(JSON.stringify(err, null, "\t"));
	};
	sendRequest(connection);
});

connection.addListener("timeout", function() {
	connection.end();
});

connection.addListener("close", function() {
	connection.end();
});

connection.addListener("error", function(exception) {
	console.log(JSON.stringify(exception));
});

connection.connect("/tmp/nginx.sock");

var then = new Date().getTime();	
var last = 0;
setInterval(function() {
	var now = new Date().getTime();
	var elapsed = (now - then)/1000;
	var rps = count - last;
	console.log("InRate: " + parseInt((((bytesin)/elapsed)*8)/(1024*1024)) + ", OutRate: " + parseInt((((bytesout)/elapsed)*8)/(1024*1024)) + ", Record: " + recordId + ", Count: " + count + ", RPS: " + rps/elapsed);
	then = new Date().getTime();
	last = count;
	bytesin = 0;
	bytesout = 0;
}, 1000);
