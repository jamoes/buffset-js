(function() {
  var Db, RedisStore, Server, app, connect, db, dbHost, dbName, dbPass, dbPort, dbUser, express, extensions, getLocals, helpers, jade, mongo, openid, port, querystring, redis, relyingParty, server, url, _;
  express = require('express');
  connect = require('connect');
  openid = require('openid');
  url = require('url');
  querystring = require('querystring');
  jade = require('jade');
  mongo = require('mongodb');
  redis = require('connect-redis');
  _ = require('underscore');
  extensions = [
    new openid.AttributeExchange({
      "http://axschema.org/contact/email": "required",
      "http://axschema.org/namePerson/first": "required",
      "http://axschema.org/namePerson/last": "required"
    })
  ];
  relyingParty = new openid.RelyingParty('http://dev:4000/verify', null, false, false, extensions);
  Server = mongo.Server;
  Db = mongo.Db;
  RedisStore = redis(express);
  app = express.createServer(express.logger());
  dbHost = 'localhost';
  dbPort = 27017;
  dbUser = '';
  dbPass = '';
  dbName = 'buffsets';
  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    return app.use(express.cookieParser());
  });
  app.configure('development', function() {
    app.use(express.static(__dirname + '/public'));
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
    return app.use(express.session({
      secret: "keyboard cat",
      store: new RedisStore({
        maxAge: 24 * 60 * 60 * 1000
      })
    }));
  });
  app.configure('production', function() {
    var arr, oneYear, redisConfig;
    oneYear = 31557600000;
    app.use(express.static(__dirname + '/public', {
      maxAge: oneYear
    }));
    app.use(express.errorHandler());
    arr = (process.env.MONGOHQ_URL || '').split(/:|@|\//);
    dbUser = arr[3];
    dbPass = arr[4];
    dbHost = arr[5];
    dbPort = arr[6];
    dbName = arr[7];
    redisConfig = (process.env.REDISTOGO_URL || '').split(/:|@|\//);
    return app.use(express.session({
      secret: "keyboard cat",
      store: new RedisStore({
        maxAge: 90 * 24 * 60 * 60 * 1000,
        pass: redisConfig[4],
        host: redisConfig[5],
        port: redisConfig[6]
      })
    }));
  });
  server = new Server(dbHost, dbPort, {
    auto_reconnect: true
  });
  db = new Db(dbName, server);
  db.open(function(err, db) {
    if (!err) {
      console.log("MongoDB connected");
      if (dbUser && dbPass) {
        return db.authenticate(dbUser, dbPass, function(err) {
          if (err) {
            return console.log(err);
          } else {
            return console.log("MongoDB authenticated");
          }
        });
      }
    } else {
      return console.log(err);
    }
  });
  helpers = {
    fives: function(num, unit, one, five, ten) {
      var c, i, ones, str;
      str = [];
      c = num / unit;
      if (c === 9) {
        str.push(one);
        str.push(ten);
        num -= 9 * unit;
      } else if (c >= 5) {
        str.push(five);
        num -= 5 * unit;
      } else if (c === 4) {
        str.push(one);
        str.push(five);
        num -= 4 * unit;
      }
      c = Math.floor(num / unit);
      if (c > 0) {
        ones = (function() {
          var _results;
          _results = [];
          for (i = 1; 1 <= c ? i <= c : i >= c; 1 <= c ? i++ : i--) {
            _results.push(one);
          }
          return _results;
        })();
        str.push(ones.join(''));
        num -= c * unit;
      }
      return [str.join(''), num];
    },
    romanize: function(number) {
      var arr, num, s, str;
      if (number > 3999) {
        return 'Inf';
      } else {
        str = [];
        num = number;
        arr = helpers.fives(num, 1000, 'M', '?', '?');
        s = arr[0];
        num = arr[1];
        str.push(s);
        arr = helpers.fives(num, 100, 'C', 'D', 'M');
        s = arr[0];
        num = arr[1];
        str.push(s);
        arr = helpers.fives(num, 10, 'X', 'L', 'C');
        s = arr[0];
        num = arr[1];
        str.push(s);
        return str.join('');
      }
    },
    tallyize: function(number) {
      var i, ones, slashes, str;
      if (number > 0) {
        ones = number % 10;
        str = [helpers.romanize(number - ones), ' '];
        if (ones >= 5) {
          str.push(String.fromCharCode(822, 47, 822, 47, 822, 47, 822, 47));
          str.push(' ');
          ones = ones - 5;
        }
        if (ones > 0) {
          slashes = (function() {
            var _results;
            _results = [];
            for (i = 1; 1 <= ones ? i <= ones : i >= ones; 1 <= ones ? i++ : i--) {
              _results.push('/');
            }
            return _results;
          })();
          str.push(slashes.join(''));
        }
        return str.join('').trim();
      } else {
        return "0";
      }
    }
  };
  getLocals = function(more) {
    return _.extend(more, {
      active_users_count: 2,
      users_count: 3,
      admin: true,
      helpers: helpers
    });
  };
  app.get('/', function(request, response, next) {
    var locals;
    locals = getLocals({
      title: 'Tapjoy Buffsets.js'
    });
    return jade.renderFile('views/index.jade', {
      locals: locals
    }, function(error, html) {
      if (error) {
        next(error);
      }
      return response.send(html);
    });
  });
  app.get('/authenticate', function(request, response) {
    var identifier;
    identifier = 'https://www.google.com/accounts/o8/id';
    return relyingParty.authenticate(identifier, false, function(error, authUrl) {
      if (error) {
        return response.send('Authentication failed: ' + error);
      } else if (!authUrl) {
        return response.send('Authentication failed');
      } else {
        console.log(authUrl);
        response.writeHead(302, {
          Location: authUrl
        });
        return response.end();
      }
    });
  });
  app.get('/verify', function(request, response) {
    return relyingParty.verifyAssertion(request, function(error, result) {
      if (!error && result.authenticated) {
        return response.send(result);
      } else {
        return response.send('Failure :(');
      }
    });
  });
  app.get('/users', function(request, response, next) {
    return db.collection('users', function(err, collection) {
      return collection.find({
        active: true
      }).toArray(function(err, users) {
        var locals;
        if (err) {
          next(err);
        }
        locals = getLocals({
          title: 'Tapjoy Buffsets.js - Users',
          users: users,
          current_user: users[0]
        });
        return jade.renderFile('views/users/index.jade', {
          locals: locals
        }, function(error, html) {
          if (error) {
            next(error);
          }
          return response.send(html);
        });
      });
    });
  });
  app.get('/users/:id', function(request, response, next) {
    return db.collection('users', function(err, collection) {
      return collection.find({
        _id: new db.bson_serializer.ObjectID(request.params.id)
      }).toArray(function(err, users) {
        var locals;
        if (err) {
          next(err);
        }
        locals = getLocals({
          title: 'Tapjoy Buffsets.js - User ' + users[0].name,
          user: users[0],
          users: users,
          current_user: users[0]
        });
        return jade.renderFile('views/users/show.jade', {
          locals: locals
        }, function(error, html) {
          if (error) {
            next(error);
          }
          return response.send(html);
        });
      });
    });
  });
  app.post('/users/:id', function(request, response, next) {
    var user;
    user = {
      pushup_set_count: request.body.user.pushup_set_count
    };
    return db.collection('users', function(err, collection) {
      return collection.update({}, {
        $set: user
      }, {}, function(err) {
        return response.redirect('back');
      });
    });
  });
  app.get('/cart/add/:item', function(req, res) {
    req.session.items = req.session.items || [];
    req.session.items.push(req.params.item);
    return res.send('cart is now ' + '[' + req.session.items.join(',') + ']');
  });
  app.get('/cart', function(req, res) {
    req.session.items = req.session.items || [];
    if (req.session.items && req.session.items.length) {
      return res.send('shopping-cart: ' + req.session.items.join(','));
    }
  });
  port = process.env.PORT || 4000;
  app.listen(port, function() {
    return console.log("Listening on " + port);
  });
}).call(this);
