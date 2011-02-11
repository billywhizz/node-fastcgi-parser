node benchmark/createtestfiles.js 1000000
node benchmark/speed-http.js http.out 16384 response
node benchmark/speed-fcgi.js fastcgi.out 16384
node benchmark/speed-fcgi.js fastcgi.in 16384
node benchmark/speed-http.js http.in 16384 request
