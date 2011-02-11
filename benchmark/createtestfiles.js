var sys = require("sys");
var fastcgi = require("../lib/fastcgi");
var fs = require("fs");

var records = parseInt(process.ARGV[2]);
var writer = new fastcgi.writer();
var response = "HTTP/1.1 200 OK\r\nConnection: Keep-Alive\r\nContent-Length: 10\r\nContent-Type: text/plain\r\n\r\n0123456789";
var params = [
	["SCRIPT_FILENAME", "/test.js"],
	["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
];
var paramlen = fastcgi.getParamLength(params);

var fd = fs.openSync("http.out", "w", 0655);
var log = {
	"write": function(buff) {
		return fs.writeSync(fd, buff, 0, buff.length); 
	},
	"end": function() {
		return fs.closeSync(fd);
	}
};

var bb = new Buffer(response);
for(var i=0; i<records; i++) {
	log.write(bb);
}
log.end();

var request = "GET /test.js HTTP/1.1\r\nHost: shuttle.owner.net:82\r\nAccept: */*\r\nConnection: Keep-Alive\r\nAccept-Encoding: none\r\nUser-Agent: Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)\r\n\r\n";

var fd = fs.openSync("http.in", "w", 0655);
log = {
	"write": function(buff) {
		return fs.writeSync(fd, buff, 0, buff.length); 
	},
	"end": function() {
		return fs.closeSync(fd);
	}
};

bb = new Buffer(request);
for(var i=0; i<records; i++) {
	log.write(bb);
}
log.end();

var fd = fs.openSync("fastcgi.out", "w", 0655);
log = {
	"write": function(buff) {
		return fs.writeSync(fd, buff, 0, buff.length); 
	},
	"end": function() {
		return fs.closeSync(fd);
	}
};

for(var i=0; i<records; i++) {
	writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDOUT,
		"recordId": 1,
		"contentLength": response.length,
		"paddingLength": 0
	});
	writer.writeBody(response);
	log.write(writer.tobuffer());
	writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDOUT,
		"recordId": 1,
		"contentLength": 0,
		"paddingLength": 0
	});
	log.write(writer.tobuffer());
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
	log.write(writer.tobuffer());
}
log.end();

/*
log = fs.createWriteStream("fastcgi.in", {'flags': 'w'
	, 'encoding': null
	, 'mode': 0555
});
*/
var fd = fs.openSync("fastcgi.in", "w", 0655);
log = {
	"write": function(buff) {
		return fs.writeSync(fd, buff, 0, buff.length); 
	},
	"end": function() {
		return fs.closeSync(fd);
	}
};

for(var i=0; i<records; i++) {
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
	log.write(writer.tobuffer());
	writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": 1,
		"contentLength": paramlen,
		"paddingLength": 0
	});
	writer.writeParams(params);
	log.write(writer.tobuffer());
	writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_PARAMS,
		"recordId": 1,
		"contentLength": 0,
		"paddingLength": 0
	});
	log.write(writer.tobuffer());
	writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": fastcgi.constants.record.FCGI_STDIN,
		"recordId": 1,
		"contentLength": 0,
		"paddingLength": 0
	});
	log.write(writer.tobuffer());
}
log.end();