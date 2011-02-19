var net = require("net");
var fastcgi = require("../lib/fastcgi");

var params = [
	["SCRIPT_FILENAME", "/test.js"],
	["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_METHOD", "GET"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];

var payload = new Buffer("hello");
var bytesin = 0;
var bytesout = 0;
var reqid = 0;
var keepalive = true;

var clients = parseInt(process.ARGV[2] || 1);
var host = null;
var port = "/tmp/nginx.sock";

function writeSocket(socket, buffer) {
	bytesout += buffer.length;
	socket.write(buffer);
}

var count = 0;
var recordId = 0;

function client() {
	var connection = new net.Stream();
	connection.setNoDelay(false);
	connection.setTimeout(0);
	
	connection.addListener("connect", function() {
		var writer = new fastcgi.writer();
		writer.encoding = "binary";
		var parser = new fastcgi.parser();
		parser.encoding = "binary";
	
		var header = {
			"version": fastcgi.constants.version,
			"type": fastcgi.constants.record.FCGI_BEGIN,
			"recordId": 0,
			"contentLength": 0,
			"paddingLength": 0
		};	
	
		var begin = {
			"role": fastcgi.constants.role.FCGI_RESPONDER,
			"flags": keepalive?fastcgi.constants.keepalive.ON:fastcgi.constants.keepalive.OFF
		}
	
		var paramlen = fastcgi.getParamLength(params);
		var FCGI_BEGIN = fastcgi.constants.record.FCGI_BEGIN;
		var FCGI_PARAMS = fastcgi.constants.record.FCGI_PARAMS;
		var FCGI_STDIN = fastcgi.constants.record.FCGI_STDIN;
		var FCGI_END = fastcgi.constants.record.FCGI_END;
		
		connection.ondata = function (buffer, start, end) {
			bytesin += (end-start);
			parser.execute(buffer, start, end);
		};
		
		function sendRequest() {
			header.type = FCGI_BEGIN;
			header.recordId = reqid++;
			header.contentLength = 8;
			writer.writeHeader(header);
			writer.writeBegin(begin);
			writeSocket(connection, writer.tobuffer());
			header.type = FCGI_PARAMS;
			header.contentLength = paramlen;
			writer.writeHeader(header);
			writer.writeParams(params);
			writeSocket(connection, writer.tobuffer());
			header.contentLength = 0;
			writer.writeHeader(header);
			writeSocket(connection, writer.tobuffer());
			header.type = FCGI_STDIN;
			//header.contentLength = 5;
			//writer.writeHeader(header);
			//writer.writeBody(payload);
			//writeSocket(connection, writer.tobuffer());
			header.contentLength = 0;
			writer.writeHeader(header);
			writeSocket(connection, writer.tobuffer());
			if(!keepalive) connection.end();
		}
	
		parser.onRecord = function(record) {
			recordId = record.header.recordId;
			if(record.header.type == FCGI_END) {
				count++;
				if(keepalive) sendRequest(connection);
			}
		};
		parser.onError = function(err) {
			console.log(JSON.stringify(err, null, "\t"));
		};
		sendRequest(connection);
	});
	
	connection.addListener("timeout", function() {
		connection.end();
	});
	
	connection.addListener("close", function() {
		setTimeout(function() {
			connection.connect(port, host);
		}, 500);
	});
	
	connection.addListener("end", function() {
	});
	
	connection.addListener("error", function(exception) {
		console.log(JSON.stringify(exception));
	});
	
	connection.connect(port, host);
}

while(clients--) {
	setTimeout(client, 200);
}

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
