var Buffer = module.exports = require('buffer').Buffer;
var proto = Buffer.prototype;

// Writes a 32 bit integer at offset
proto.int32Write = function int32Write(number, offset) {
	offset = offset || 0;
	this[offset] = (number & 0xff000000) >> 24;
	this[offset + 1] = (number & 0xff0000) >> 16;
	this[offset + 2] = (number & 0xff00) >> 8;
	this[offset + 3] = (number & 0xff);
};

// Writes a 16 bit integer at offset
proto.int16Write = function int16Write(number, offset) {
	offset = offset || 0;
	this[offset] = (number & 0xff00) >> 8;
	this[offset + 1] = (number & 0xff);
}

// Writes a 16 bit integer at offset
proto.intWrite = function intWrite(number, offset) {
	offset = offset || 0;
	this[offset] = (number & 0xff);
}

Buffer.fromString = function fromString(string) {
  var b = new Buffer(Buffer.byteLength(string));
  b.write(string, 'utf8');
  return b;
}

Buffer.makeWriter = function makeWriter() {
  var data = [];
  var writer;
  var push = {
    int32: function pushInt32(number) {
      var b = new Buffer(4);
      b.int32Write(number);
      data.push(b);
      return writer;
    },
    int16: function pushInt16(number) {
        var b = new Buffer(2);
        b.int16Write(number);
        data.push(b);
        return writer;
    },
    int: function pushInt(number) {
        var b = new Buffer(1);
        b.intWrite(number);
        data.push(b);
        return writer;
    },
    string: function pushString(string) {
        data.push(Buffer.fromString(string));
        return writer;
    }
  };
  writer = {
    data: data,
    push: push,
    
    // Convert an array of buffers into a single buffer using memcopy
    toBuffer: function toBuffer() {
      var total = 0;
      var i, l = data.length;
      for (i = 0; i < l; i++) {
        total += data[i].length;
      }
      var b = new Buffer(total);
      var offset = 0;
      for (i = 0; i < l; i++) {
        data[i].copy(b, offset);
        offset += data[i].length;
      }
      return b;
    }
  };
  return writer;
}