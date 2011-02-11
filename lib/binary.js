function Binary() {
}

Binary.prototype.pack = function(fields, buff, offset) {
	var e = fields.length + 1;
	var i = offset;
	var next = 0;
	while(--e) {
		var field = fields[next++];
		switch(Object.keys(field)[0]) {
			case "int":
				buff[i++] = field.int & 0xff;
				break;
			case "int16":
				buff[i++] = (field.int16 >> 8) & 0xff;
				buff[i++] = field.int16 & 0xff;
				break;
			case "int32":
				buff[i++] = (field.int32 >> 24) & 0xff;			
				buff[i++] = (field.int32 >> 16) & 0xff;
				buff[i++] = (field.int32 >> 8) & 0xff;
				buff[i++] = field.int32 & 0xff;
				break;
			case "string":
			case "ascii":
				buff.asciiWrite(field.string, i);
				i += field.string.length;
				break;
			case "utf8":
				break;
		}
	}
	//return 136;
	return (i - offset);
}

Binary.prototype.unpack = function(pattern, offset, buff) {
	var len = pattern.length;
	var i = offset;
	var pi = 0;
	var res = [];
	while(pi < len) {
		switch(pattern[pi]) {
			case "N":
				res.push((buff[i++] << 24) + (buff[i++] << 16) + (buff[i++] << 8) + buff[i++]);
				pi++;
				break;
			case "n":
				res.push((buff[i++] << 8) + buff[i++]);
				pi++;
				break;
			case "o":
				res.push(buff[i++]);
				pi++;
				break;
			case "s":
			case "a":
				var slen = 1;
				var tmp = 0;
				while(true) {
					tmp = pattern[pi + slen];
					if(!(tmp >= "0" && tmp <= "9")) {
						break;
					}
					slen++;
				}
				var strlen = parseInt(pattern.substring(pi + 1, pi + slen));
				res.push(buff.asciiSlice(i, i+strlen));
				i += strlen;
				pi += slen;
				break;
			case "u":
				break;
		}
	}
	return res;
}

exports.Binary = Binary;