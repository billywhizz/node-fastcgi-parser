var sys = require("sys");
var net = require("net");
var fastcgi = require("../lib/fastcgi");

/*
This example should send a cgi request to php running as a cgi server

Run PHP as follows:

export PHP_FCGI_MAX_REQUESTS=1000000
export PHP_FCGI_CHILDREN=2

php-cgi -b /tmp/php.sock

This will create a php-cgi process which will spawn two children to handle requests on the unix domain socket at /tmp/php.sock. Each child process will handle 1 million requests before restarting itself

You can then run this example to fire requests at the php server
You will need to change the SCRIPT_FILENAME param below to the full path of a script that is available to the php application
*/
var params = [
	["SCRIPT_FILENAME", "/source/test.php"],
	["HTTP_USER_AGENT", "tester"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["DOCUMENT_ROOT", "/source/"],
	["HTTP_HOST", "shuttle.owner.net:82"],
	["PHP_FCGI_MAX_REQUESTS", "1000000"]
];

var reqid = 0;

function sendRequest(connection) {
	try {
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
			"contentLength": 0,
			"paddingLength": 0
		});
		connection.write(connection.writer.tobuffer());
	}
	catch(ex) {
		connection.end();
	}
}

var count = 0;
var recordId = 0;

function client() {
	var connection = new net.Stream();
	connection.setNoDelay(true);
	connection.setTimeout(0);
	
	connection.ondata = function (buffer, start, end) {
		//sys.puts(JSON.stringify(buffer.slice(start, end), null, "\t"));
		connection.parser.execute(buffer.slice(start, end));
	};
	
	connection.addListener("connect", function() {
		connection.writer = new fastcgi.writer();
		connection.parser = new fastcgi.parser();
		connection.parser.onRecord = function(record) {
			//sys.puts(JSON.stringify(record, null, "\t"));
			count++;
			recordId = record.header.recordId;
			if(record.header.type == fastcgi.constants.record.FCGI_END) {
				sendRequest(connection);
			}
		};
		connection.parser.onError = function(err) {
			sys.puts(JSON.stringify(err, null, "\t"));
		};
		sendRequest(connection);
	});
	
	connection.addListener("timeout", function() {
		connection.end();
	});
	
	connection.addListener("end", function() {
	});
	
	connection.addListener("close", function() {
		connection.end();
		setTimeout(function() {
			connection.connect("/tmp/php.sock);
		}, 1000);
	});
	
	connection.addListener("error", function(exception) {
		sys.puts(JSON.stringify(exception));
		connection.end();
	});
	
	connection.connect("/tmp/php.sock");
}
for(var i=0; i< 1; i++) {
	client();
}

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
