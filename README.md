# FastCGI Parser for Node.js

A very basic FastCGI parser for low level parsing of the FastCGI protocol. Can be used to build FastCGI applications which are called from an existing web server (nginx/lighttpd/apache etc.) or to interact with FastCGI applications.

# Dependencies
- currently using creatonix's buffer_extras module for binary packing. this will be replaced by a more efficient c++ addon or i might make the binary packing/unpacking pluggable
  
# Todo
	
## Usage (see tests/test.js)

# Server Configuration

## Lighttpd 

	fastcgi.server = ( ".js" =>
		( "localhost" =>
			(
				"socket" => "/tmp/nginx.sock",
				"check-local" => "disable"
			)
		)
	)
	
## nginx

	location ~ \.js$ {
		fastcgi_pass   unix:/tmp/nginx.sock;
		fastcgi_param  SCRIPT_FILENAME  /scripts$fastcgi_script_name;
	}

# API

fastcgi.parser

parser.encoding = ["utf8"|"ascii"|"binary"]

default is utf8. this determines the encoding used when reading the body of an STDIN/STDOUT/STDERR record. utf8 or ascii mean no onBody callback will be fired and the record in onRecord will have a body property set to the correctly encoded string.
binary will mean no body property is set on the record returned in the onRecord callback and chunks of the body will be emitted in the onBody callback as they arrive. 

parser.reset = function()

resets the parser so it can be executed on a new stream. you should use this aftaer an error or when re-using an already existing parser on a new stream. 

parser.init = function()

completely reinitialises the parser. calls parser.reset as well as setting encoding back to default (utf8) and clearing all callback handlers

parser.execute = function(buffer) 

parses the buffer. calls callback.

fastcgi.constants

	"version": 1,
	"record": {
		"FCGI_BEGIN": 1,
		"FCGI_ABORT": 2,
		"FCGI_END": 3,
		"FCGI_PARAMS": 4,
		"FCGI_STDIN": 5,
		"FCGI_STDOUT": 6,
		"FCGI_STDERR": 7,
		"FCGI_DATA": 8,
		"FCGI_GET_VALUES": 9,
		"FCGI_GET_VALUES_RESULT": 10,
		"FCGI_UNKNOWN_TYPE": 11
	},
	"keepalive": {
		"OFF": 0,
		"ON": 1
	},
	"parser": {
		"state": {
			"HEADER": 0,
			"BODY": 1,
			"PADDING": 2
		}
	},
	"general": {
		"FCGI_HEADER_LEN": 8,
		"FCGI_MAX_BODY": Math.pow(2,16)
	},
	"errors": {
		"BUFFER_OVERFLOW": {
			"err": 1,
			"description": "buffer overflow"
		},
		"MAX_BODY_EXCEEDED": {
			"err": 2,
			"description": "a body greater than maximum body size was read/written"
		}
	},
	"flags": {
		"FCGI_KEEP_CONN": 1
	},
	"role": {
		"FCGI_RESPONDER": 1,
		"FCGI_AUTHORIZER": 2,
		"FCGI_FILTER": 3
	},
	"protocol": {
		"status": {
			"FCGI_REQUEST_COMPLETE": 0,
			"FCGI_CANT_MPX_CONN": 1,
			"FCGI_OVERLOADED": 2,
			"FCGI_UNKNOWN_ROLE": 3
		}
	},
	"values": {
		"FCGI_MAX_CONNS": "FCGI_MAX_CONNS",
		"FCGI_MAX_REQS": "FCGI_MAX_REQS",
		"FCGI_MPXS_CONNS": "FCGI_MPXS_CONNS"
	}
