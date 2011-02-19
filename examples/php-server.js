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
	["SCRIPT_FILENAME", "/usr/share/nginx/html/mediawiki/config/index.php"],
	["QUERY_STRING", ""],
	["REQUEST_METHOD", "GET"],
	["CONTENT_TYPE", ""],
	["CONTENT_LENGTH", ""],
	["SCRIPT_NAME", "/test.php"],
	["REQUEST_URI", "/test.php"],
	["DOCUMENT_URI", "/test.php"],
	["DOCUMENT_ROOT", "/source"],
	["SERVER_PROTOCOL", "HTTP/1.1"],
	["GATEWAY_INTERFACE", "CGI/1.1"],
	["SERVER_SOFTWARE", "nginx/0.7.67"],
	["REMOTE_ADDR", "10.11.12.8"],
	["REMOTE_PORT", "4335"],
	["SERVER_ADDR", "10.11.12.8"],
	["SERVER_PORT", "82"],
	["SERVER_NAME", "_"],
	["REDIRECT_STATUS", "200"],
	["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"],
	["HTTP_ACCEPT", "*/*"],
	["HTTP_HOST", "shuttle.owner.net:82"]
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
			"flags": fastcgi.constants.keepalive.OFF
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
		//console.log(JSON.stringify(buffer.slice(start, end), null, "\t"));
		connection.parser.execute(buffer.slice(start, end));
	};
	
	connection.addListener("connect", function() {
		connection.writer = new fastcgi.writer();
		connection.parser = new fastcgi.parser();
		connection.parser.onRecord = function(record) {
			console.log(JSON.stringify(record, null, "\t"));
			count++;
			recordId = record.header.recordId;
		};

		connection.parser.onHeader = function(header) {
			if(header.type == fastcgi.constants.record.FCGI_STDOUT) {
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
	
	connection.addListener("end", function() {
		//console.log("end");
		connection.destroy();
	});
	
	connection.addListener("close", function() {
		setTimeout(function() {
			//console.log("reconnect");
			//connection.connect("/tmp/nginx.sock");
			//connection.connect(6000, "icms.owner.net");
		}, 0);
	});
	
	connection.addListener("error", function(exception) {
		console.log(JSON.stringify(exception));
		connection.end();
	});
	
	connection.connect(6000, "icms.owner.net");
}

client();

var then = new Date().getTime();	
var last = 0;
setInterval(function() {
	var now = new Date().getTime();
	var elapsed = now - then;
	var rps = count - last;
	console.log("Record: " + recordId + ", Count: " + count + ", RPS: " + rps/(elapsed/1000));
	then = new Date().getTime();
	last = count;
}, 1000);
