var binary = require("./binary");

/*

TODO: 
* make the write handle a stream and write directly to it without creating buffers
* we assume everything is ascii
* allow chunked parsing of body (not really necessary as fastcgi protocol allows breaking up of body into separate messages
* allow writer to write to an existing buffer at offset passed in. should be a lot quicker than allocating and slicing...
* don't do pre-allocated buffers in parser. just pass back start and end of current buffer to the callee. should be a lot faster
* Add a resetonerror property to allow parser to stop processing immediately if an error is encountered
* Add a reset method to clear the current parser
* Pool of parsers?
* make buffering more efficent - maybe parse down into the body types and raise event for each param etc.
* think about overhead per connection
* allow a http stream to be parsed on the fly and wrapped in cgi (in and out). maybe inherit from node.js stream and implement pipe (like HTTPS)
* test for buffer overruns
* unit tests
* improve binary parser

*/
 
var _bin = new binary.Binary();

var constants = {
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
		"FCGI_MAX_BODY": 8192
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
}

function Parser() {
	var _parser = this;
	var loc = 0;
	var record = {
		"header": {
			"version": 0,
			"type": 0,
			"recordId": 0,
			"contentLength": 0,
			"paddingLength": 0
		},
		"body": {}
	};
	var _header = new Buffer(constants.general.FCGI_HEADER_LEN);
	var _body = new Buffer(constants.general.FCGI_MAX_BODY);
	_parser.state = constants.parser.state.HEADER;
	
	_parser.encoding = "utf8";
	
	_parser.onRecord = _parser.onError = _parser.onHeader = _parser.onParam = null;
	
	var tmp = null;
	
	function parseBody() {
		switch(record.header.type) {
			case constants.record.FCGI_BEGIN:
				tmp = _bin.unpack("no", 0, _body);
				record.body = {
					"role": tmp[0],
					"flags": tmp[1]
				}
				break;
			case constants.record.FCGI_ABORT:
				break;
			case constants.record.FCGI_END:
				tmp = _bin.unpack("No", 0, _body);
				record.body = {
					"status": tmp[0],
					"protocolStatus": tmp[1]
				}
				break;
			case constants.record.FCGI_PARAMS:
			case constants.record.FCGI_GET_VALUES:
			case constants.record.FCGI_GET_VALUES_RESULT:
				if(record.header.contentLength > 0) {
					var ploc = 0, name = "", value = "", vsize = 0, hsize = 0;
					record.body.params = {};
					while(ploc < record.header.contentLength) {
						hsize = _body[ploc];
						if(hsize >> 7 == 1) {
							hsize = _bin.unpack("N", 0, _body)[0] & 0x7fffffff;
							ploc += 4;
						}
						else {
							ploc++;
						}
						vsize = _body[ploc];
						if(vsize >> 7 == 1) {
							vsize = _bin.unpack("N", 0, _body)[0] & 0x7fffffff;
							ploc += 4;
						}
						else {
							ploc++;
						}
						if((ploc + hsize + vsize) <= _body.length) {
							name = _body.toString('utf8', ploc, ploc += hsize);
							value = _body.toString('utf8', ploc, ploc += vsize);
							if(_parser.onParam) _parser.onParam(name, value);
							record.body.params[name] = value;
						}
						else {
							if(_parser.onError) _parser.onError(new Error(JSON.stringify(constants.errors.BUFFER_OVERRUN)));
							ploc = record.header.contentLength;
						}
					}
				}
				break;
			case constants.record.FCGI_STDIN:
			case constants.record.FCGI_STDOUT:
			case constants.record.FCGI_STDERR:
			case constants.record.FCGI_DATA:
				if(record.header.contentLength > 0) {
					//TODO: am thinking i should return a buffer here, or maybe we should just emit chunks of the body as it comes in from the parser below
					if(_parser.encoding && _parser.encoding !== "binary") {
						record.body = _body.toString('utf8', 0, record.header.contentLength);
					}
					else
						record.body = _body.slice(0, record.header.contentLength);
				}
				break;
			case constants.record.FCGI_UNKNOWN_TYPE:
			default:
				record.body = {
					"type": _body[0]
				}
				break;
		}
	}
	
	_parser.execute = function(buffer) {
		for (var i = 0; i < buffer.length; i++) {
			switch(_parser.state) {
				case constants.parser.state.HEADER:
					if(loc == constants.general.FCGI_HEADER_LEN - 1) {
						_header[loc] = buffer[i];
						var tmp = _bin.unpack("oonno", 0, _header);
						record.header.version = tmp[0];
						record.header.type = tmp[1];
						record.header.recordId = tmp[2];
						record.header.contentLength = tmp[3];
						record.header.paddingLength = tmp[4];
						record.body = {};
						// finished parsing header. inform the caller
						if(record.header.contentLength > 0) {
							if(_parser.onHeader) _parser.onHeader(record.header);
							_parser.state = constants.parser.state.BODY;
						}
						else {
							// the record has no body so skip the header event
							if(_parser.onRecord) _parser.onRecord(record);
						}
						loc=0;
					}
					else {
						_header[loc++] = buffer[i];
					}
					break;
				case constants.parser.state.BODY:
					if(loc == record.header.contentLength - 1) {
						_body[loc] = buffer[i];
						parseBody();
						// finished parsing record. inform the caller
						if(_parser.onRecord) _parser.onRecord(record);
						loc = 0;
						if(record.header.paddingLength > 0) {
							_parser.state = constants.parser.state.PADDING;
						}
						else {
							_parser.state = constants.parser.state.HEADER;
						}
					}
					else {
						_body[loc++] = buffer[i];
					}
					break;
				case constants.parser.state.PADDING:
					if(loc++ == record.header.paddingLength - 1) {
						_parser.state = constants.parser.state.HEADER;
						loc = 0;
					}
					break;
			}
		}
	}
}

function Writer() {
	var _writer = this;
	var _pos = 0;
	//TODO: add buffer overrun checks - won't be get errors thrown from pack method?? if so, add try/catch blocks
	
	_writer.buffer = null;

	_writer.tobuffer = function() {
		return _writer.buffer;
	}
	
	_writer.writeHeader = function(header) {
		_pos = 0;
		_writer.buffer = new Buffer(header.contentLength + header.paddingLength + constants.general.FCGI_HEADER_LEN);
		_bin.pack([
			{"int": header.version},
			{"int": header.type},
			{"int16": header.recordId},
			{"int16": header.contentLength},
			{"int": header.paddingLength},
			{"int": 0}
		], _writer.buffer, _pos);
		_pos += constants.general.FCGI_HEADER_LEN;
	}
	
	_writer.writeParams = function(params) {
		var pbuff = [];
		var size = 0;
		params.forEach(function(param) {
			if(param[0].length > 127) {
				pbuff.push({"int32": param[0].length | 0x80000000});
				size += 4;
			}
			else {
				pbuff.push({"int": param[0].length});
				size++;
			}
			if(param[1].length > 127) {
				pbuff.push({"int32": param[1].length | 0x80000000});
				size += 4;
			}
			else {
				pbuff.push({"int": param[1].length});
				size++;
			}
			pbuff.push({"string": param[0]});
			pbuff.push({"string": param[1]});
			size += (param[0].length + param[1].length);
		});
		_bin.pack(pbuff, _writer.buffer, _pos);
		_pos += size;
	}

	//TODO: will we have unicode issues with lengths??
	_writer.writeBody = function(body) {
		if(body instanceof Buffer) {
			body.copy(_writer.buffer, _pos);
			_pos += body.length;
		}
		else {
			_writer.buffer.write(body, _pos);
			_pos += body.length;
		}
	}

	_writer.writeBegin = function(begin) {
		_bin.pack([
			{"int16": begin.role},
			{"int": begin.flags},
			{"int32": 0},
			{"int": 0}
		], _writer.buffer, _pos);
		_pos += 8;
	}

	_writer.writeEnd = function(end) {
		_bin.pack([
			{"int32": end.status},
			{"int": end.protocolStatus},
			{"int": 0},
			{"int": 0},
			{"int": 0}
		], _writer.buffer, _pos);
		_pos += 8;
	}

}

exports.parser = Parser;
exports.writer = Writer;
exports.constants = constants;

// used to determine length of params body. pass in array of param pairs as follows:
/*
var len = fastcgi.getParamLength([
	["HTTP_USER_AGENT", maxbuff],
	["HTTP_ACCEPT_ENCODING", "none"],
	["HTTP_CONNECTION", "Keep-Alive"]
]);
*/
exports.getParamLength = function(params) {
	var size = 0;
	params.forEach(function(param) {
		size += (param[0].length + param[1].length);
		if(param[0].length > 127) {
			size += 4;
		}
		else {
			size++;
		}
		if(param[1].length > 127) {
			size += 4;
		}
		else {
			size++;
		}
	});
	return size;
}

