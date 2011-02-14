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

var paramsAssoc = {
	TEST: "hello",
	LOLLIES: "yespls"
};

var testString = "This is a test string to be put through an FCGI_STDOUT record.";
var imageData = require("fs").readFileSync(require("path").join(__dirname, "fixtures", "test.png"));

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
		};
	});
	
	return context;
};

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
	
	"when writing a simple FCGI_STDOUT": {
		topic: function() {
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

vows.describe("FCGI Library (higher-level)").addBatch({
	"when writing a FCGI_BEGIN record": {
		topic: function() {
			writer.writeRecord(new fastcgi.records.BEGIN(fastcgi.constants.role.FCGI_FILTER, 123), 15);
			return writer.tobuffer();
		},
		
		"we get a valid Buffer": function(topic) {
			assert.isObject(topic);
			assert.instanceOf(topic, Buffer);
		},
		
		"and parsing it again": {
			topic: function(topic) {
				var parser = new fastcgi.Client();
				parser.encoding = "binary";
				parser.onRecord = function(record, requestId) {
					this.callback(null, {record: record, requestId: requestId});
				}.bind(this);
				parser.execute(topic);
			},
			
			"gives us a valid record": function(topic) {
				assert.isObject(topic.record);
				assert.instanceOf(topic.record, fastcgi.records.BEGIN);
			},

			"and a valid request id": function(topic) {
				assert.isNumber(topic.requestId);
				assert.equal(topic.requestId, 15);
			},
			
			"with the correct data": function(topic) {
				assert.equal(topic.record.role, fastcgi.constants.role.FCGI_FILTER);
				assert.equal(topic.record.flags, 123);
			}
		}
	},
	
	"when writing a FCGI_PARAMS record": {
		topic: function() {
			writer.writeRecord(new fastcgi.records.PARAMS(paramsAssoc), 15);
	
			return writer.tobuffer();
		},
		
		"and parsing it again": {
			topic: function(topic) {
				var parser = new fastcgi.Client();
				parser.encoding = "binary";
				parser.onRecord = function(record, requestId) {
					this.callback(null, {record: record, requestId: requestId});
				}.bind(this);
				parser.execute(topic);
			},
			
			"we get the correct record": function(topic) {
				assert.instanceOf(topic.record, fastcgi.records.PARAMS);
			},
			
			"with the correct parameters": function(topic) {
				var topicParams = topic.record.getObject();
				Object.keys(paramsAssoc).forEach(function(paramName) {
					assert.isString(topicParams[paramName], "Record did not include param " + paramName);
					assert.equal(topicParams[paramName], paramsAssoc[paramName], "Param " + paramName + " had incorrect value.");
				});
			}
		}
	}
}).export(module);
