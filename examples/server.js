var net = require("net");
var fastcgi = require("../lib/fastcgi");

var payload = "hello";
var message = {
	"status": {
		"status": 0,
		"protocolStatus": 200
	},
	"body": new Buffer("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + payload.length + "\r\nContent-Type: text/plain\r\n\r\n" + payload),
	"header": {
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDOUT,
		"recordId": 0,
		"contentLength": 0,
		"paddingLength": 0
	}
};

var recordId = 0;
var requests = 0;
var responses = 0;
var connections = 0;
var gconnections = 0;

var bytesin = 0;
var bytesout = 0;

function writeSocket(socket, buffer) {
	bytesout += buffer.length;
	try {
		socket.write(buffer);
	}
	catch(ex) {
		console.log(ex);
	}
}

var fcgid = net.createServer(function (socket) {
    socket.setTimeout(0);
    socket.setNoDelay(false);
	var parser = new fastcgi.parser();
	parser.encoding = "binary";
	var writer = new fastcgi.writer();
	writer.encoding = "binary";

	var FCGI_BEGIN = fastcgi.constants.record.FCGI_BEGIN;
	var FCGI_PARAMS = fastcgi.constants.record.FCGI_PARAMS;
	var FCGI_STDIN = fastcgi.constants.record.FCGI_STDIN;
	var FCGI_END = fastcgi.constants.record.FCGI_END;
	var FCGI_STDOUT = fastcgi.constants.record.FCGI_STDOUT;

	socket.ondata = function (buffer, start, end) {
		bytesin += (end-start);
		parser.execute(buffer, start, end);
	};

	socket.on("error", function(err) {
		console.log(err);
	});

	socket.addListener("close", function() {
		connections--;
	});

	socket.addListener("connect", function() {
		connections++;
		gconnections++;
		socket.keepalive = false;
		parser.onError = function(exception) {
			console.log(JSON.stringify(exception, null, "\t"));
		};
		parser.onRecord = function(record) {
			//console.log(record);
			recordId = record.header.recordId;
			switch(record.header.type) {
				case FCGI_BEGIN:
					socket.keepalive = (record.body.flags == 1);
					break;
				case FCGI_PARAMS:
					if(record.header.contentLength == 0) {
						message.header.type = FCGI_STDOUT;
						message.header.recordId = recordId;
						message.header.contentLength = message.body.length;
						writer.writeHeader(message.header);
						writer.writeBody(message.body);
						writeSocket(socket, writer.tobuffer());
						
						message.header.contentLength = 0;
						writer.writeHeader(message.header);
						writeSocket(socket, writer.tobuffer());
						
						message.header.contentLength = 8;
						message.header.type = FCGI_END;
						writer.writeHeader(message.header);
						writer.writeEnd(message.status);
						writeSocket(socket, writer.tobuffer());
						
						responses++;
					}
					break;
				case FCGI_STDIN:
					if(record.header.contentLength == 0) {
						requests++;
						if(!socket.keepalive) {
							socket.end();
						}
					}
					break;
			}
		};
	});

});
fcgid.listen("/tmp/nginx.sock");

var then = new Date().getTime();	
var last = 0;

setInterval(function() {
	var now = new Date().getTime();
	var elapsed = (now - then)/1000;
	var rps = requests - last;
	console.log("InRate: " + parseInt((((bytesin)/elapsed)*8)/(1024*1024)) + ", OutRate: " + parseInt((((bytesout)/elapsed)*8)/(1024*1024)) + ", Record: " + recordId + ", requests: " + requests + ", RPS: " + rps/elapsed + ", A/Conn: " + connections + ", T/Conn: " + gconnections);
	then = new Date().getTime();
	last = requests;
	bytesin = 0;
	bytesout = 0;
}, 1000);
