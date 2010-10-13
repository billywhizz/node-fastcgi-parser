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

