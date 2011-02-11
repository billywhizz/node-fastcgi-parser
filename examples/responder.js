#!/usr/local/bin/node

var util = require('util');
var fs = require("fs");
var IOWatcher = process.binding('io_watcher').IOWatcher;
var net = require("net");
var fastcgi = require("../lib/fastcgi");

var log = fs.createWriteStream("/tmp/responder.log", {
	"flags": "w",
	"encoding": null,
	"mode": 0777
});

process.on('uncaughtException', function (err) {
	log.write('Caught exception: ' + JSON.stringify(err, null, "\t") + "\n");
});

var output = "HTTP/1.1 200 OK\r\nContent-Length: 10\r\nContent-Type: text/plain\r\n\r\n0123456789";

watcher = new IOWatcher();
watcher.callback = function() {
	var peerInfo = process.binding('net').accept(0);
	clientfd = peerInfo.fd;
	//log.write("accept: " + JSON.stringify(peerInfo, null, "\t") + "\n");
	var s = new net.Stream(clientfd);
	var parser = new fastcgi.parser();
	var writer = new fastcgi.writer();

	parser.onError = function(exception) {
		log.write(JSON.stringify(exception, null, "\t"));
	};

	parser.onRecord = function(record) {
		recordId = record.header.recordId;
		//log.write("record: [\n" + JSON.stringify(record, null, "\t") + "]\n");
		switch(record.header.type) {
			case fastcgi.constants.record.FCGI_BEGIN:
				s.keepalive = (record.body.flags == 1);
				break;
			case fastcgi.constants.record.FCGI_PARAMS:
				break;
			case fastcgi.constants.record.FCGI_STDIN:
				if(record.header.contentLength == 0) {
					writer.writeHeader({
						"version": fastcgi.constants.version,
						"type": fastcgi.constants.record.FCGI_STDOUT,
						"recordId": record.header.recordId,
						"contentLength": output.length,
						"paddingLength": 0
					});
					writer.writeBody(output);
					s.write(writer.tobuffer());
					writer.writeHeader({
						"version": fastcgi.constants.version,
						"type": fastcgi.constants.record.FCGI_STDOUT,
						"recordId": record.header.recordId,
						"contentLength": 0,
						"paddingLength": 0
					});
					s.write(writer.tobuffer());
					writer.writeHeader({
						"version": fastcgi.constants.version,
						"type": fastcgi.constants.record.FCGI_END,
						"recordId": record.header.recordId,
						"contentLength": 8,
						"paddingLength": 0
					});
					writer.writeEnd({
						"status": 0,
						"protocolStatus": 200
					});
					s.write(writer.tobuffer());
					if(!s.keepalive) {
						s.end();
					}
				}
				break;
		}
	};
	
	s.ondata = function (buffer, start, end) {
		parser.execute(buffer.slice(start, end));
	};

	s.on("end", function() {
		log.write("end\n");
	});

	s.on("close", function(had_error) {
		log.write("close\n");
	});

	s.resume();
};
watcher.set(0, true, false); // read=true, write=false
watcher.start();