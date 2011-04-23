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
	["SCRIPT_FILENAME", "/var/www/html/index.php"],
	["QUERY_STRING", ""],
	["REQUEST_METHOD", "GET"],
	["CONTENT_TYPE", ""],
	["CONTENT_LENGTH", ""],
	["SCRIPT_NAME", "/index.php"],
	["REQUEST_URI", "/index.php"],
	["QUERY_STRING", ""],
	["DOCUMENT_URI", "/index.php"],
	["DOCUMENT_ROOT", "/var/www/html"],
	["PHP_SELF", "/index.php"],
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
	["HTTP_HOST", "pr.icms.owner.net:82"]
];

var requests = 0;
var keepalive = (process.ARGV[2] == "true");
var responses = 0;
var recordId = 0;

function client() {
	var connection = new net.Stream();
	connection.setNoDelay(true);
	connection.setTimeout(0);
	var _recid = 0;
	var writer = null;
	var parser = null;
	var plen = fastcgi.getParamLength(params);
	var FCGI_RESPONDER = fastcgi.constants.role.FCGI_RESPONDER;
	var FCGI_BEGIN = fastcgi.constants.record.FCGI_BEGIN;
	var FCGI_STDIN = fastcgi.constants.record.FCGI_STDIN;
	var FCGI_STDOUT = fastcgi.constants.record.FCGI_STDOUT;
	var FCGI_PARAMS = fastcgi.constants.record.FCGI_PARAMS;
	var FCGI_END = fastcgi.constants.record.FCGI_END;
	var header = {
		"version": fastcgi.constants.version,
		"type": FCGI_BEGIN,
		"recordId": 0,
		"contentLength": 0,
		"paddingLength": 0
	};
	var begin = {
		"role": FCGI_RESPONDER,
		"flags": keepalive?fastcgi.constants.keepalive.ON:fastcgi.constants.keepalive.OFF
	};

	function sendRequest() {
		requests++;
		writer.writeHeader({
			"version": fastcgi.constants.version,
			"type": fastcgi.constants.record.FCGI_BEGIN,
			"recordId": requests,
			"contentLength": 8,
			"paddingLength": 0
		});
		writer.writeBegin({
			"role": fastcgi.constants.role.FCGI_RESPONDER,
			"flags": keepalive?fastcgi.constants.keepalive.ON:fastcgi.constants.keepalive.OFF
		});
		connection.write(writer.tobuffer());
		writer.writeHeader({
			"version": fastcgi.constants.version,
			"type": fastcgi.constants.record.FCGI_PARAMS,
			"recordId": requests,
			"contentLength": fastcgi.getParamLength(params),
			"paddingLength": 0
		});
		writer.writeParams(params);
		connection.write(writer.tobuffer());
		writer.writeHeader({
			"version": fastcgi.constants.version,
			"type": fastcgi.constants.record.FCGI_PARAMS,
			"recordId": requests,
			"contentLength": 0,
			"paddingLength": 0
		});
		connection.write(writer.tobuffer());
		writer.writeHeader({
			"version": fastcgi.constants.version,
			"type": fastcgi.constants.record.FCGI_STDIN,
			"recordId": requests,
			"contentLength": 0,
			"paddingLength": 0
		});
		connection.write(writer.tobuffer());
	}
/*
	function sendRequest() {
		header.type = FCGI_BEGIN;
		header.recordId = requests++;
		header.contentLength = 8;
		writer.writeHeader(header);
		writer.writeBegin(begin);
		connection.write(writer.tobuffer());
		header.type = FCGI_PARAMS;
		header.contentLength = plen;
		writer.writeHeader(header);
		writer.writeParams(params);
		connection.write(writer.tobuffer());
		header.contentLength = 0;
		writer.writeHeader(header);
		connection.write(writer.tobuffer());
		header.type = FCGI_STDIN;
		writer.writeHeader(header);
		connection.write(writer.tobuffer());
	}
*/		
	connection.ondata = function (buffer, start, end) {
		parser.execute(buffer, start, end);
	};
	
	connection.addListener("connect", function() {
		writer = new fastcgi.writer();
		writer.encoding = "binary";
		parser = new fastcgi.parser();
		parser.encoding = "binary";
		//var body = "";
		
		parser.onRecord = function(record) {
			//if(record.header.type == FCGI_STDOUT) record.body = body
			//console.log(record);
			if(record.header.type == FCGI_END) {
				responses++;
			}
			recordId = record.header.recordId;
		};

		parser.onHeader = function(header) {
			body = "";
			if(keepalive) {
				if(header.recordId != _recid) {
					_recid = header.recordId;
					sendRequest(connection);
				}
			}
		};
		
		parser.onError = function(err) {
			console.log(JSON.stringify(err, null, "\t"));
		};

/*		
		parser.onBody = function(buffer, start, end) {
			body += buffer.toString("utf8", start, end);
			//process.stdout.write(buffer.slice(start, end));
		};
*/
		
		sendRequest(connection);
	});
	
	connection.addListener("timeout", function() {
		connection.end();
	});
	
	connection.addListener("end", function() {
	});
	
	connection.addListener("close", function() {
		setTimeout(function() {
			connection.connect(process.ARGV[4], process.ARGV[5]) || null;
		}, 0);
	});
	
	connection.addListener("error", function(err) {
		console.log(JSON.stringify(err));
		connection.end();
	});
	
	connection.connect(process.ARGV[4], process.ARGV[5] || null);
}

var clients = parseInt(process.ARGV[3] || 1);
while(clients--) {
	client();
}

var then = new Date().getTime();	
var last = 0;
setInterval(function() {
	var now = new Date().getTime();
	var elapsed = now - then;
	var rps = responses - last;
	console.log("Requests: " + requests + ", Responses: " + responses + ", RPS: " + rps/(elapsed/1000));
	then = new Date().getTime();
	last = responses;
}, 1000);
