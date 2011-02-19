var vows = require("vows"),
	assert = require("assert"),
	fastcgi = require("../lib/fastcgi");

var writer = new fastcgi.writer();

var params = [
	["TEST1", "value"],
	["TEST2", "anotherval"],
	["TEST3", "123"],
	["TEST4", ""],
];

var testString = "This is a test string to be put through an FCGI_STDOUT record.";
var imageData = require("fs").readFileSync(require("path").join(__dirname, "fixtures", "test.png"))
var testStringUtf8 = "räksmörgås";

var createParamsRecordTests = function() {
	var context = {
		topic: function(buffer) {
			var parser = new fastcgi.parser();
			parser.onRecord = function(record) {
				this.callback(null, record);
			}.bind(this);
			parser.execute(buffer);
		},
		
		"results in a body with params": function(record) {
			assert.isObject(record.body.params);
		}
	};
	params.forEach(function(param) {
		var paramName = param[0];
		var paramValue = param[1];
		
		context["contains param " + paramName] = function(record) {
			assert.isString(record.body.params[paramName]);
			assert.equal(record.body.params[paramName], paramValue);
		}
	});
	
	return context;
}

vows.describe("FCGI Library").addBatch({
	"when writing a FCGI_Begin record": {
		topic: function() {
			writer.writeHeader({
				"version": fastcgi.constants.version,
				"type": fastcgi.constants.record.FCGI_BEGIN,
				"recordId": 123,
				"contentLength": 8,
				"paddingLength": 0
			});
			writer.writeBegin({
				"role": fastcgi.constants.role.FCGI_RESPONDER,
				"flags": fastcgi.constants.keepalive.ON
			});
			
			return writer.tobuffer();
		},
		
		"output is a Buffer": function(buffer) {
			assert.instanceOf(buffer, Buffer);
		},
		
		"output is correct length": function(buffer) {
			assert.equal(buffer.length, 16);
		},
		
		"and parsing it again": {
			topic: function(buffer) {
				var parser = new fastcgi.parser();
				parser.onRecord = function(record) {
					this.callback(null, record);
				}.bind(this);
				parser.execute(buffer);
			},
			
			"results in a valid record": function(record) {
				assert.isObject(record);
				assert.isObject(record.header);
				assert.isObject(record.body);
			},
			
			"with the correct header": function(record) {
				assert.equal(record.header.version, fastcgi.constants.version);
				assert.equal(record.header.type, fastcgi.constants.record.FCGI_BEGIN);
				assert.equal(record.header.recordId, 123);
				assert.equal(record.header.contentLength, 8);
				assert.equal(record.header.paddingLength, 0);
			},
			
			"and the correct body": function(record) {
				assert.equal(record.body.role, fastcgi.constants.role.FCGI_RESPONDER);
				assert.equal(record.body.flags, fastcgi.constants.keepalive.ON);
			}
		}
	},
	
	// TODO: tests for FCGI_END, FCGI_ABORT, and other boring records.
	
	"getParamLength on our params": {
		topic: fastcgi.getParamLength(params),
		
		"gives us the correct size": function(topic) {
			assert.equal(topic, 46);
		}
	},
	
	"when writing a FCGI_PARAMS record": {
		topic: function() {
			writer.writeHeader({
				"version": fastcgi.constants.version,
				"type": fastcgi.constants.record.FCGI_PARAMS,
				"recordId": 123,
				"contentLength": fastcgi.getParamLength(params),
				"paddingLength": 0
			});
			writer.writeParams(params);

			return writer.tobuffer();
		},
		
		"and parsing it again": createParamsRecordTests()
	},
	
	"when writing a utf8 string FCGI_STDOUT": {
		topic: function() {
			writer.encoding = "utf8";
			writer.writeHeader({
				"version": fastcgi.constants.version,
				"type": fastcgi.constants.record.FCGI_STDOUT,
				"recordId": 123,
				"contentLength": testStringUtf8.length,
				"paddingLength": 0
			});
			writer.writeBody(testStringUtf8);

			return writer.tobuffer();
		},
		
		"and parsing it again": {
			topic: function(buffer) {
				var parser = new fastcgi.parser();
				parser.encoding = "ascii";
				parser.onRecord = function(record) {
					this.callback(null, record);
				}.bind(this);
				parser.execute(buffer);
			},
			
			"we get a string body": function(record) {
				assert.isString(record.body);
			},
			
			"with the correct data": function(record) {
				assert.equal(record.body, testStringUtf8);
			}
		}
	},
	
	"when writing an ascii string FCGI_STDOUT": {
		topic: function() {
			writer.encoding = "ascii";
			writer.writeHeader({
				"version": fastcgi.constants.version,
				"type": fastcgi.constants.record.FCGI_STDOUT,
				"recordId": 123,
				"contentLength": testString.length,
				"paddingLength": 0
			});
			writer.writeBody(testString);

			return writer.tobuffer();
		},
		
		"and parsing it again": {
			topic: function(buffer) {
				var parser = new fastcgi.parser();
				parser.encoding = "ascii";
				parser.onRecord = function(record) {
					this.callback(null, record);
				}.bind(this);
				parser.execute(buffer);
			},
			
			"we get a string body": function(record) {
				assert.isString(record.body);
			},
			
			"with the correct data": function(record) {
				assert.equal(record.body, testString);
			}
		}
	},
	
	"when writing a binary FCGI_STDOUT": {
		topic: function() {
			writer.encoding = "binary";
			writer.writeHeader({
				"version": fastcgi.constants.version,
				"type": fastcgi.constants.record.FCGI_STDOUT,
				"recordId": 123,
				"contentLength": imageData.length,
				"paddingLength": 0
			});
			writer.writeBody(imageData);

			return writer.tobuffer();
		},
		
		"and parsing it again": {
			topic: function(buffer) {
				var parser = new fastcgi.parser();
				parser.encoding = "binary";
				parser.onRecord = function(record) {
					this.callback(null, record);
				}.bind(this);
				parser.execute(buffer);
			},
			
			"we get a Buffer body": function(record) {
				assert.isObject(record.body);
				assert.instanceOf(record.body, Buffer);
			},
			
			"with the correct length": function(record) {
				assert.equal(record.body.length, imageData.length);
			},
			
			"and the exact same data": function(record) {
				for(var i = 0; i < record.body.length; i++) {
					assert.equal(record.body[i], imageData[i], "Octet at index " + i + " does not match.");
				}
			}
		}
	}
}).export(module);