var sys = require("sys");
var net = require("net");
var fastcgi = require("../lib/fastcgi");

var output = "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 5\r\nContent-Type: text/plain\r\n\r\nhello";

var recordId = 0;
var count = 0;
var connections = 0;
var gconnections = 0;

var fcgid = net.createServer(function (socket) {
    socket.setTimeout(0);
    socket.setNoDelay(true);
	socket.ondata = function (buffer, start, end) {
		socket.parser.execute(buffer.slice(start, end));
	};
	socket.addListener("connect", function() {
		connections++;
		gconnections++;
		socket.parser = new fastcgi.parser();
		socket.writer = new fastcgi.writer();
		socket.keepalive = false;
		socket.parser.addListener("error", function(exception) {
			sys.puts(JSON.stringify(exception, null, "\t"));
		});
		socket.parser.addListener("end", function() {
			connections--;
		});
		socket.parser.addListener("close", function() {
			connections--;
		});
		socket.parser.addListener("record", function(record) {
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
						socket.write(socket.writer.tobuffer());
						socket.writer.writeHeader({
							"version": fastcgi.constants.version,
							"type": fastcgi.constants.record.FCGI_STDOUT,
							"recordId": record.header.recordId,
							"contentLength": 0,
							"paddingLength": 0
						});
						socket.write(socket.writer.tobuffer());
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
						socket.write(socket.writer.tobuffer());
						if(!socket.keepalive) {
							socket.end();
						}
					}
					break;
			}
		});
	});

});
fcgid.listen("/tmp/nginx.sock");

var then = new Date().getTime();	
var last = 0;
setInterval(function() {
	var now = new Date().getTime();
	var elapsed = now - then;
	var rps = count - last;
	sys.puts("Record: " + recordId + ", Count: " + count + ", RPS: " + rps/(elapsed/1000) + ", A/Conn: " + connections + ", T/Conn: " + gconnections);
	then = new Date().getTime();
	last = count;
}, 1000);
