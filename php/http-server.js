var http = require("http");
var php = require("./node-php");
var urlp = require("url");
var path = require("path");
var paperboy = require("paperboy");
var options = require("./options").options;

var rewrites = [
	[new RegExp("^/$"), "/index.php"],
	[new RegExp("^(.*)/\\?(.*)$"), "$1/index.php?$2"],
	[new RegExp("^(.*)/$"), "$1/index.php"]
];
var agent = new php.Agent(4, options);
var reqs = 0;
var resps = 0;

agent.on("error", function(err) {
	console.log("client.error");
	console.log(err);
});

http.createServer(function (req, res) {
	rewrites.some(function(rewrite) {
		if(req.url.match(rewrite[0])) {
			var replace = req.url.replace(rewrite[0], rewrite[1]);
			req.url = replace;
			return true;
		}
		return false;
	});
	var url = urlp.parse(req.url);
	var ext = path.extname(url.pathname);
	if(ext === ".php") {
		agent.request(req, res, function(err, response) {
			if(err) console.log(err);
		});
	}
	else {
		paperboy
			.deliver(options.root, req, res)
			.addHeader("Cache-Control", "public, max-age=2538768")
	}
}).listen(options.server.port, options.server.host);