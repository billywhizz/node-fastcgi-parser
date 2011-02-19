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

var output = new Buffer("HTTP/1.1 200 OK\r\nContent-Length: 10\r\nContent-Type: text/plain\r\n\r\n0123456789");

watcher = new IOWatcher();
watcher.callback = function() {
	var peerInfo = process.binding('net').accept(0);
	clientfd = peerInfo.fd;
	var s = new net.Stream(clientfd);
	var parser = new fastcgi.parser();
	parser.encoding = "binary";
	var writer = new fastcgi.writer();
	writer.encoding = "binary";

	var header = {
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDOUT,
		"recordId": 0,
		"contentLength": 0,
		"paddingLength": 0
	};
	var end = {
		"status": 0,
		"protocolStatus": 200
	};
	var plen = output.length;
	
	parser.onError = function(exception) {
		log.write(JSON.stringify(exception, null, "\t"));
	};

	parser.onRecord = function(record) {
		recordId = record.header.recordId;
		header.recordId = recordId;
		switch(record.header.type) {
			case fastcgi.constants.record.FCGI_BEGIN:
				s.keepalive = (record.body.flags == 1);
				break;
			case fastcgi.constants.record.FCGI_PARAMS:
				break;
			case fastcgi.constants.record.FCGI_STDIN:
				if(record.header.contentLength == 0) {
					header.type = fastcgi.constants.record.FCGI_STDOUT;
					header.contentLength = plen;
					writer.writeHeader(header);
					writer.writeBody(output);
					s.write(writer.tobuffer());
					header.contentLength = 0;
					writer.writeHeader(header);
					s.write(writer.tobuffer());
					header.type = fastcgi.constants.record.FCGI_END;
					header.contentLength = 8;
					writer.writeHeader(header);
					writer.writeEnd(end);
					s.write(writer.tobuffer());
					if(!s.keepalive) {
						s.end();
					}
				}
				break;
		}
	};
	
	s.ondata = function (buffer, start, end) {
		parser.execute(buffer, start, end);
	};

	s.on("end", function() {
		//log.write("end\n");
	});

	s.on("close", function(had_error) {
		//log.write("close\n");
	});

	s.resume();
};
watcher.set(0, true, false); // read=true, write=false
watcher.start();