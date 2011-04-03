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
}

function Parser() {
	var _parser = this;
	var _loc = 0;
	var _record = null;

	// these are in here because code runs fastest with them in here
	var FCGI_MAX_BODY = constants.general.FCGI_MAX_BODY;
	var HEADER = constants.parser.state.HEADER;
	var BODY = constants.parser.state.BODY;
	var PADDING = constants.parser.state.PADDING;
	var FCGI_HEADER_LEN = constants.general.FCGI_HEADER_LEN;
	var FCGI_BEGIN = constants.record.FCGI_BEGIN;
	var FCGI_ABORT = constants.record.FCGI_ABORT;
	var FCGI_END = constants.record.FCGI_END;
	var FCGI_PARAMS = constants.record.FCGI_PARAMS;
	var FCGI_STDIN = constants.record.FCGI_STDIN;
	var FCGI_STDOUT = constants.record.FCGI_STDOUT;
	var FCGI_STDERR = constants.record.FCGI_STDERR;
	var FCGI_DATA = constants.record.FCGI_DATA;
	var FCGI_GET_VALUES = constants.record.FCGI_GET_VALUES;
	var FCGI_GET_VALUES_RESULT = constants.record.FCGI_GET_VALUES_RESULT;
	var FCGI_UNKNOWN_TYPE = constants.record.FCGI_UNKNOWN_TYPE;
	var BUFFER_OVERRUN = constants.errors.BUFFER_OVERRUN;

	var _header = new Buffer(FCGI_HEADER_LEN);
	var _body = new Buffer(FCGI_MAX_BODY);

	_parser.current = _record;
	
	_parser.init = function() {
		_parser.encoding = "utf8";
		_parser.onRecord = _parser.onError = _parser.onHeader = _parser.onParam = _parser.onBody = function(){};
		_parser.reset();
	}

	_parser.reset = function() {
		_record = {
			"header": {
				"version": 0,
				"type": 0,
				"recordId": 0,
				"contentLength": 0,
				"paddingLength": 0
			},
			"body": {}
		};
		_parser.state = constants.parser.state.HEADER;
		_loc = 0;
	}

	_parser.init();
		
	_parser.execute = function(buffer, start, end) {
		if(!start) start = 0;
		if(!end) end = buffer.length;
		try {
			for (var i = start; i < end; i++) {
				switch(_parser.state) {
					case HEADER:
						if(_loc == FCGI_HEADER_LEN - 1) {
							var header = _record.header;
							_header[_loc] = buffer[i];
							var j = 0;
							header.version = _header[j++];
							header.type = _header[j++];
							header.recordId = (_header[j++] << 8) + _header[j++];
							header.contentLength = (_header[j++] << 8) + _header[j++];
							header.paddingLength = _header[j++];
							_record.body = {};
							if(_record.header.contentLength > 0) {
								_parser.onHeader(header);
								_parser.state = BODY;
							}
							else {
								_parser.onRecord(_record);
							}
							_loc=0;
						}
						else {
							_header[_loc++] = buffer[i];
						}
						break;
					case BODY:
						if(_loc == _record.header.contentLength - 1) {
							_body[_loc] = buffer[i];
							switch(_record.header.type) {
								case FCGI_BEGIN:
									var j = 0;
									_record.body = {
										"role": (_body[j++] << 8) + _body[j++],
										"flags": _body[j++]
									}
									break;
								case FCGI_ABORT:
									break;
								case FCGI_END:
									var j = 0;
									_record.body = {
										"status": (_body[j++] << 24) + (_body[j++] << 16) + (_body[j++] << 8) + _body[j++],
										"protocolStatus": _body[j++]
									}
									break;
								case FCGI_PARAMS:
								case FCGI_GET_VALUES:
								case FCGI_GET_VALUES_RESULT:
									var j = 0, name = "", value = "", vlen = 0, nlen = 0;
									_record.body.params = {};
									var rlen = _record.header.contentLength;
									while(j < rlen) {
										nlen = _body[j];
										if(nlen >> 7 == 1) {
											nlen = ((_body[j++] << 24) + (_body[j++] << 16) + (_body[j++] << 8) + _body[j++]) & 0x7fffffff;
										}
										else {
											j++;
										}
										vlen = _body[j];
										if(vlen >> 7 == 1) {
											vlen = ((_body[j++] << 24) + (_body[j++] << 16) + (_body[j++] << 8) + _body[j++]) & 0x7fffffff;
										}
										else {
											j++;
										}
										if((j + nlen + vlen) <= _body.length) {
											var nv = _body.asciiSlice(j, j + nlen + vlen);
											j += (nlen + vlen);
											name = nv.substring(0, nlen);
											value = nv.substring(nlen);
											_parser.onParam(name, value);
											_record.body.params[name] = value;
										}
										else {
											_parser.onError(new Error(JSON.stringify(BUFFER_OVERRUN)));
											j = rlen;
										}
									}
									break;
								case FCGI_STDIN:
								case FCGI_STDOUT:
								case FCGI_STDERR:
								case FCGI_DATA:
									switch(_parser.encoding) {
										case "utf8":
											_record.body = _body.utf8Slice(0, _record.header.contentLength);
											break;
										case "ascii":
											_record.body = _body.asciiSlice(0, _record.header.contentLength);
											break;
										default:
											_parser.onBody(_body, 0, _record.header.contentLength);
											break;
									}
									break;
								case FCGI_UNKNOWN_TYPE:
								default:
									_record.body = {
										"type": _body[0]
									}
									break;
							}
							_parser.onRecord(_record);
							_loc = 0;
							if(_record.header.paddingLength > 0) {
								_parser.state = PADDING;
							}
							else {
								_parser.state = HEADER;
							}
						}
						else {
							_body[_loc++] = buffer[i];
						}
						break;
					case PADDING:
						if(_loc++ == _record.header.paddingLength - 1) {
							_parser.state = HEADER;
							_loc = 0;
						}
						break;
				}
			}
		}
		catch(ex) {
			console.log(ex);
		}
	}
}

//TODO: add buffer overrun checks - won't be get errors thrown from pack method?? if so, add try/catch blocks
function Writer() {
	var _writer = this;
	var _pos = 0;
	var FCGI_HEADER_LEN = constants.general.FCGI_HEADER_LEN;
	var FCGI_MAX_BODY = constants.general.FCGI_MAX_BODY;
	var _buffer = new Buffer(FCGI_MAX_BODY + FCGI_HEADER_LEN);
	
	_writer.encoding = "utf8";
	
	_writer.buffer = {
		"length": 0,
		"buffer": _buffer
	};

	_writer.tobuffer = function() {
		return _buffer.slice(0, _writer.buffer.length);
	}
	
	_writer.writeHeader = function(header) {
		var i = 0;
		_buffer[i++] = header.version & 0xff;
		_buffer[i++] = header.type & 0xff;
		_buffer[i++] = (header.recordId >> 8) & 0xff;
		_buffer[i++] = header.recordId & 0xff;
		_buffer[i++] = (header.contentLength >> 8) & 0xff;
		_buffer[i++] = header.contentLength & 0xff;
		_buffer[i++] = header.paddingLength & 0xff;
		_buffer[i++] = 0;
		_writer.buffer.length = header.contentLength + header.paddingLength + FCGI_HEADER_LEN;
		_pos = i;
	}
	
	_writer.writeParams = function(params) {
		var i = _pos;
		var plen = params.length;
		var index = 0;
		// loop optimisation
		while(plen--) {
			var param = params[index++];
			var name = param[0];
			var value = param[1].toString();
			var nlen = name.length;
			var vlen = value.length;
			if(nlen > 127) {
				var nlen1 = nlen | 0x80000000;
				_buffer[i++] = (nlen1 >> 24) & 0xff;			
				_buffer[i++] = (nlen1 >> 16) & 0xff;
				_buffer[i++] = (nlen1 >> 8) & 0xff;
				_buffer[i++] = nlen1 & 0xff;
			}
			else {
				_buffer[i++] = nlen & 0xff;
			}
			if(vlen > 127) {
				var vlen1 = vlen | 0x80000000;
				_buffer[i++] = (vlen1 >> 24) & 0xff;			
				_buffer[i++] = (vlen1 >> 16) & 0xff;
				_buffer[i++] = (vlen1 >> 8) & 0xff;
				_buffer[i++] = vlen1 & 0xff;
			}
			else {
				_buffer[i++] = vlen & 0xff;
			}
			//_buffer.write(name + value, i, "ascii");
			_buffer.asciiWrite(name + value, i, nlen + vlen);
			i += (nlen + vlen);
		}
		_pos = i;
	}

	_writer.writeBody = function(body) {
		switch(_writer.encoding) {
			case "ascii":
				_pos += _buffer.asciiWrite(body, _pos, _buffer.length - _pos);
				break;
			case "utf8":
				_pos += _buffer.utf8Write(body, _pos, _buffer.length - _pos);
				break;
			default:
				body.copy(_buffer, _pos);
				_pos += body.length;
				break;
		}
	}

	_writer.writeBegin = function(begin) {
		var i = _pos;
		_buffer[i++] = (begin.role >> 8) & 0xff;
		_buffer[i++] = begin.role & 0xff;
		_buffer[i++] = begin.flags & 0xff;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_pos = i;
	}

	_writer.writeEnd = function(end) {
		var i = _pos;
		_buffer[i++] = (end.status >> 24) & 0xff;
		_buffer[i++] = (end.status >> 16) & 0xff;
		_buffer[i++] = (end.status >> 8) & 0xff;
		_buffer[i++] = end.status & 0xff;
		_buffer[i++] = end.protocolStatus & 0xff;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_buffer[i++] = 0;
		_pos = i;
	}

}

exports.parser = Parser;
exports.writer = Writer;
exports.constants = constants;

exports.getParamLength = function(params) {
	var size = 0;
	params.forEach(function(param) {
		size += (param[0].length + param[1].toString().length);
		if(param[0].length > 127) {
			size += 4;
		}
		else {
			size++;
		}
		if(param[1].toString().length > 127) {
			size += 4;
		}
		else {
			size++;
		}
	});
	return size;
}

