var net = require("net");
var fastcgi = require("../lib/fastcgi");

var output = "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 10\r\nContent-Type: text/plain\r\n\r\n0123456789";

var recordId = 0;
var count = 0;
var connections = 0;
var gconnections = 0;

var bytesin = 0;
var bytesout = 0;

function writeSocket(socket, buffer) {
	bytesout += buffer.length;
	socket.write(buffer);
}

var fcgid = net.createServer(function (socket) {
    socket.setTimeout(0);
    socket.setNoDelay(true);
	socket.ondata = function (buffer, start, end) {
		bytesin += (end-start);
		socket.parser.execute(buffer.slice(start, end));
	};
	socket.addListener("connect", function() {
		connections++;
		gconnections++;
		socket.parser = new fastcgi.parser();
		socket.writer = new fastcgi.writer();
		socket.keepalive = false;
		socket.addListener("close", function() {
			connections--;
		});
		socket.parser.onError = function(exception) {
			console.log(JSON.stringify(exception, null, "\t"));
		};
		socket.parser.onRecord = function(record) {
			recordId = record.header.recordId;
			count++;
			switch(record.header.type) {
				case fastcgi.constants.record.FCGI_BEGIN:
					socket.keepalive = (record.body.flags == 1);
					break;
				case fastcgi.constants.record.FCGI_PARAMS:
					break;
				case fastcgi.constants.record.FCGI_STDIN:
					if(record.header.contentLength == 0) {
						socket.writer.writeHeader({
							"version": fastcgi.constants.version,
							"type": fastcgi.constants.record.FCGI_STDOUT,
							"recordId": record.header.recordId,
							"contentLength": output.length,
							"paddingLength": 0
						});
						socket.writer.writeBody(output);
						writeSocket(socket, socket.writer.tobuffer());
						socket.writer.writeHeader({
							"version": fastcgi.constants.version,
							"type": fastcgi.constants.record.FCGI_STDOUT,
							"recordId": record.header.recordId,
							"contentLength": 0,
							"paddingLength": 0
						});
						writeSocket(socket, socket.writer.tobuffer());
						socket.writer.writeHeader({
							"version": fastcgi.constants.version,
							"type": fastcgi.constants.record.FCGI_END,
							"recordId": record.header.recordId,
							"contentLength": 8,
							"paddingLength": 0
						});
						socket.writer.writeEnd({
							"status": 0,
							"protocolStatus": 200
						});
						writeSocket(socket, socket.writer.tobuffer());
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
	var rps = count - last;
	console.log("InRate: " + parseInt((((bytesin)/elapsed)*8)/(1024*1024)) + ", OutRate: " + parseInt((((bytesout)/elapsed)*8)/(1024*1024)) + ", Record: " + recordId + ", Count: " + count + ", RPS: " + rps/elapsed + ", A/Conn: " + connections + ", T/Conn: " + gconnections);
	then = new Date().getTime();
	last = count;
	bytesin = 0;
	bytesout = 0;
}, 1000);
