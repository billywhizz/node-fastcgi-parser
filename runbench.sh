node benchmark/createtestfiles.js 1000000
node benchmark/speed-http.js http.out 16 response
node benchmark/speed-fcgi.js out 16
node benchmark/speed-fcgi.js in 16
node benchmark/speed-http.js http.in 16 request
node benchmark/write-speed.js 3000000 500000
