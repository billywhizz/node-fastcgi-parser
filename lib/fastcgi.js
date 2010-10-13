var sys = require("sys");
var events = require("events");
var Buffer = require('./buffer_extras');

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
	"errors": {
		"BUFFER_OVERFLOW": {
			"err": 1,
			"description": "buffer overflow"
		}
	},
	"general": {
		"FCGI_HEADER_LEN": 8,
		"FCGI_MAX_BODY": 16384
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

/*
//TODO:
- Add a resetonerror property to allow parser to stop processing immediately if an error is encountered
- Add a reset method to clear the current parser
- Pool of parsers?
- make buffering more efficent - maybe parse down into the body types and raise event for each param etc.
*/
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
	
	var tmp = null;
	
	function parseBody() {
		switch(record.header.type) {
			case constants.record.FCGI_BEGIN:
				tmp = _body.unpack("no", 0);
				record.body = {
					"role": tmp[0],
					"flags": tmp[1]
				}
				break;
			case constants.record.FCGI_ABORT:
				break;
			case constants.record.FCGI_END:
				tmp = _body.unpack("No", 0);
				record.body = {
					"status": tmp[0],
					"protocolStatus": tmp[1]
				}
				break;
			case constants.record.FCGI_PARAMS:
			case constants.record.FCGI_GET_VALUES:
			case constants.record.FCGI_GET_VALUES_RESULT:
				if(record.header.contentLength > 0) {
					var params = _body.slice(0, record.header.contentLength);
					var ploc = 0;
					record.body.params = {};
					function nextParam() {
						var hsize = params.unpack("o", ploc)[0];
						if(hsize >> 7 == 1) {
							hsize = params.unpack("N", ploc)[0] & 0x7fffffff;
							ploc += 4;
						}
						else {
							ploc += 1;
						}
						var vsize = params.unpack("o", ploc)[0];
						if(vsize >> 7 == 1) {
							vsize = params.unpack("N", ploc)[0] & 0x7fffffff;
							ploc += 4;
						}
						else {
							ploc += 1;
						}
						if((ploc + hsize + vsize) <= params.length) {
							var name = params.slice(ploc, ploc + hsize).toString();
							var value = params.slice(ploc + hsize, ploc + hsize + vsize).toString();
							record.body.params[name] = value;
							ploc += (hsize + vsize);
						}
						else {
							_parser.emit("error", new Error(JSON.stringify(constants.errors.BUFFER_OVERRUN)));
							ploc = params.length;
						}
					}
					while(ploc < record.header.contentLength) {
						nextParam();
					}
				}
				break;
			case constants.record.FCGI_STDIN:
			case constants.record.FCGI_STDOUT:
			case constants.record.FCGI_STDERR:
			case constants.record.FCGI_DATA:
				if(record.header.contentLength > 0) {
					record.body = _body.slice(0, record.header.contentLength).toString();
				}
				break;
			case constants.record.FCGI_UNKNOWN_TYPE:
			default:
				tmp = _body.unpack("o", 0);
				record.body = {
					"type": tmp[0]
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
						var tmp = _header.unpack("oonno", 0);
						record.header.version = tmp[0];
						record.header.type = tmp[1];
						record.header.recordId = tmp[2];
						record.header.contentLength = tmp[3];
						record.header.paddingLength = tmp[4];
						record.body = {};
						if(record.header.contentLength > 0) {
							_parser.state = constants.parser.state.BODY;
						}
						else {
							parseBody();
							_parser.emit("record", record);
						}
						loc=0;
					}
					else {
						_header[loc] = buffer[i];
						loc++;
					}
					break;
				case constants.parser.state.BODY:
					if(loc == record.header.contentLength - 1) {
						_body[loc] = buffer[i];
						parseBody();
						_parser.emit("record", record);
						loc = 0;
						if(record.header.paddingLength > 0) {
							_parser.state = constants.parser.state.PADDING;
						}
						else {
								_parser.state = constants.parser.state.HEADER;
						}
					}
					else {
						_body[loc] = buffer[i];
						loc++;
					}
					break;
				case constants.parser.state.PADDING:
					if(loc == record.header.paddingLength - 1) {
						_parser.state = constants.parser.state.HEADER;
						loc = 0;
					}
					else {
						loc++;
					}
					break;
				case constants.parser.state.EMPTY:
					if(loc == (8-((record.header.contentLength + record.header.paddingLength)%8)) - 1) {
						_parser.state = constants.parser.state.HEADER;
						loc = 0;
					}
					else {
						loc++;
					}
					break;
			}
		}
	}
}
sys.inherits(Parser, events.EventEmitter);

function Writer() {
	var _writer = this;
	var _pos = 0;
	//TODO: add buffer overrun checks - won't be get errors thrown from pack method?? if so, add try/catch blocks
	
	_writer.tobuffer = function() {
		return _writer.w.toBuffer();
	}
	
	_writer.writeHeader = function(header) {
		_pos = 0;
		_writer.w = Buffer.makeWriter(); //new Buffer(header.contentLength + header.paddingLength + constants.general.FCGI_HEADER_LEN);
		_writer.w.push.int(header.version);
		_writer.w.push.int(header.type);
		_writer.w.push.int16(header.recordId);
		_writer.w.push.int16(header.contentLength);
		_writer.w.push.int(header.paddingLength);
		_writer.w.push.int(0);
		_pos += constants.general.FCGI_HEADER_LEN;
	}
	
	_writer.writeParams = function(params) {
		var size = 0;
		params.forEach(function(param) {
			if(param[0].length > 127) {
				_writer.w.push.int32(param[0].length | 0x80000000);
				size += 4;
			}
			else {
				_writer.w.push.int(param[0].length);
				size++;
			}
			if(param[1].length > 127) {
				_writer.w.push.int32(param[1].length | 0x80000000);
				size += 4;
			}
			else {
				_writer.w.push.int(param[1].length);
				size++;
			}
			_writer.w.push.string(param[0]);
			_writer.w.push.string(param[1]);
			size += (param[0].length + param[1].length);
		});
		_pos += size;
	}
	//TODO: will we have unicode issues with lengths??
	_writer.writeBody = function(body) {
		_writer.w.push.string(body);
		_pos += body.length;
	}

	_writer.writeBegin = function(begin) {
		_writer.w.push.int16(begin.role);
		_writer.w.push.int(begin.flags);
		_writer.w.push.int32(0);
		_writer.w.push.int(0);
		_pos += 8;
	}

	_writer.writeEnd = function(end) {
		_writer.w.push.int32(end.status);
		_writer.w.push.int(end.protocolStatus);
		_writer.w.push.int(0);
		_writer.w.push.int(0);
		_writer.w.push.int(0);
		_pos += 8;
	}

}
sys.inherits(Writer, events.EventEmitter);

exports.parser = Parser;
exports.writer = Writer;
exports.constants = constants;
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

