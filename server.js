var _ = require('lodash')
var chalk = require('chalk')
var http = require('http')

// Init WS SECRET
var WS_SECRET="bb98a0b6442386d0cdf8a31b267892c1"
var ranking = {}
setInterval(function(){
   var d = new Date((new Date()) - 3600000 * 24);
   Object.keys(ranking).forEach(function(element) {
     while (ranking[element]['catchUp'].length > 0 && ranking[element]['catchUp'][0] < d){
      ranking[element]['catchUp'].shift();
     }
   });
}, 300000);

if (!_.isUndefined(process.env.WS_SECRET) && !_.isNull(process.env.WS_SECRET)) {
  if (process.env.WS_SECRET.indexOf('|') > 0) {
    WS_SECRET = process.env.WS_SECRET.split('|')
  } else {
    WS_SECRET = [process.env.WS_SECRET]
  }
} else {
  try {
    var tmpSecretJson = require('./ws_secret.json')
    WS_SECRET = _.values(tmpSecretJson)
  } catch (e) {
    console.error('WS_SECRET NOT SET!!!')
  }
}

// Init http server
let server
if (process.env.NODE_ENV !== 'production') {
  var app = require('./lib/express')
  server = http.createServer(app)
} else {
  server = http.createServer()
}

// Init socket vars
var Primus = require('primus')
var api
var client

// Init API Socket connection
api = new Primus(server, {
  transformer: 'websockets',
  pathname: '/api',
  parser: 'JSON'
})

api.plugin('emit', require('primus-emit'))
api.plugin('spark-latency', require('primus-spark-latency'))

// Init Client Socket connection
client = new Primus(server, {
  transformer: 'websockets',
  pathname: '/primus',
  parser: 'JSON'
})

client.plugin('emit', require('primus-emit'))

// Init external API
let external = new Primus(server, {
  transformer: 'websockets',
  pathname: '/external',
  parser: 'JSON'
})

external.plugin('emit', require('primus-emit'))

// Init collections
var Collection = require('./lib/collection')
var Nodes = new Collection(external)

Nodes.setChartsCallback(function (err, charts) {
  if (err !== null) {
    console.error('COL', 'CHR', 'Charts error:', err)
  } else {
    client.write({
      action: 'charts',
      data: charts
    })
  }
})

// Init API Socket events
api.on('connection', function (spark) {
  console.info('API', 'CON', 'Open:', spark.address.ip)

  spark.on('hello', function (data) {
    console.info('API', 'CON', 'Hello', data['id'])

    if (_.isUndefined(data.secret) || WS_SECRET.indexOf(data.secret) === -1) {
      spark.end(undefined, { reconnect: false })
      console.error('API', 'CON', 'Closed - wrong auth', data)

      return false
    }

    if (!_.isUndefined(data.id) && !_.isUndefined(data.info)) {
      data.ip = spark.address.ip
      data.spark = spark.id
      data.latency = spark.latency || 0

      Nodes.add(data, function (err, info) {
        if (err !== null) {
          console.error('API', 'CON', 'Connection error:', err)
          return false
        }

        if (info !== null) {
          spark.emit('ready')

          console.debug('API', 'CON', 'Connected', data.id)

          client.write({
            action: 'add',
            data: info
          })
        }
      })
    }
  })

  spark.on('update', function (data) {
    if (!_.isUndefined(data.id) && !_.isUndefined(data.stats)) {
      Nodes.update(data.id, data.stats, function (err, stats) {
        if (err !== null) {
          console.error('API', 'UPD', 'Update error:', err)
        } else {
          if (stats !== null) {
            client.write({
              action: 'update',
              data: stats
            })

            console.info('API', 'UPD', 'Update from:', data.id, 'for:', stats)

            Nodes.getCharts()
          }
        }
      })
    } else {
      console.error('API', 'UPD', 'Update error:', data)
    }
  })

  spark.on('block', function (data) {
    if (!_.isUndefined(data.id) && !_.isUndefined(data.block)) {
      Nodes.addBlock(data.id, data.block, function (err, stats) {
        if (err !== null) {
          console.error('API', 'BLK', 'Block error:', err)
        } else {
          if (stats !== null) {
            client.write({
              action: 'block',
              data: stats
            })
            if(ranking[data.block['validator']] === undefined){
                ranking[data.block['validator']] = {
                  name: data.id,
                  catchUp: []
                  
                };
            } else {
              ranking[data.block['validator']]['name'] = data.id;
            }
            console.debug('API', 'BLK', 'Block:', data.block['number'], 'from:', data.id)

            Nodes.getCharts()
          }
        }
      })
    } else {
      console.error('API', 'BLK', 'Block error:', data)
    }
  })

  spark.on('pending', function (data) {
    if (!_.isUndefined(data.id) && !_.isUndefined(data.stats)) {
      Nodes.updatePending(data.id, data.stats, function (err, stats) {
        if (err !== null) {
          console.error('API', 'TXS', 'Pending error:', err)
        }

        if (stats !== null) {
          client.write({
            action: 'pending',
            data: {
		pending: data.stats.pending,
		local: data.local,
		accounts: data.accounts
	    }
          })

          console.debug('API', 'TXS', 'Pending:', data.stats['pending'], 'Local:', data.local, 'Accounts:', data.accounts, 'from:', data.id)
        }
      })
    } else {
      console.error('API', 'TXS', 'Pending error:', data)
    }
  })

  spark.on('stats', function (data) {
    if (!_.isUndefined(data.id) && !_.isUndefined(data.stats)) {
      Nodes.updateStats(data.id, data.stats, function (err, stats) {
        if (err !== null) {
          console.error('API', 'STA', 'Stats error:', err)
        } else {
          if (stats !== null) {
            client.write({
              action: 'stats',
              data: stats
            })

            console.debug('API', 'STA', 'Stats from:', data.id)
          }
        }
      })
    } else {
      var obj = JSON.parse(data.catchUp);
      if (ranking[obj.Data.NewProposer] !== undefined) {
        ranking[obj.Data.NewProposer]['catchUp'].push(new Date());
      } else {
        ranking[obj.Data.NewProposer] = {
          name: 'undefined',
          catchUp: [new Date()]
        }
      }
      
      client.write({
        action: 'errorNode',
        data: ranking
      })
     
      console.error('API', 'STA', 'Stats error:', data)
    }
  })

  spark.on('history', function (data) {
    console.debug('API', 'HIS', 'Got history from:', data.id)

    var time = chalk.reset.cyan((new Date()).toJSON()) + ' '
    console.time(time, 'COL', 'CHR', 'Got charts in')

    Nodes.addHistory(data.id, data.history, function (err, history) {
      console.timeEnd(time, 'COL', 'CHR', 'Got charts in')

      if (err !== null) {
        console.error('COL', 'CHR', 'History error:', err)
      } else {
        client.write({
          action: 'charts',
          data: history
        })
      }
    })
  })

  spark.on('node-ping', function (data) {
    var start = (!_.isUndefined(data) && !_.isUndefined(data.clientTime) ? data.clientTime : null)

    spark.emit('node-pong', {
      clientTime: start,
      serverTime: _.now()
    })

    console.info('API', 'PIN', 'Ping from:', data['id'])
  })

  spark.on('latency', function (data) {
    if (!_.isUndefined(data.id)) {
      Nodes.updateLatency(data.id, data.latency, function (err, latency) {
        if (err !== null) {
          console.error('API', 'PIN', 'Latency error:', err)
        }

        if (latency !== null) {
          console.info('API', 'PIN', 'Latency:', latency, 'from:', data.id)
        }
      })

      if (Nodes.requiresUpdate(data.id)) {
        var range = Nodes.getHistory().getHistoryRequestRange()

        spark.emit('history', range)
        console.info('API', 'HIS', 'Asked:', data.id, 'for history:', range.min, '-', range.max)

        Nodes.askedForHistory(true)
      }
    }
  })

  spark.on('end', function (data) {
    Nodes.inactive(spark.id, function (err, stats) {
      if (err !== null) {
        console.error('API', 'CON', 'Connection end error:', err)
      } else {
        client.write({
          action: 'inactive',
          data: stats
        })

        console.warn('API', 'CON', 'Connection with:', spark.id, 'ended:', data)
      }
    })
  })
})

client.on('connection', function (clientSpark) {
  clientSpark.on('ready', function (data) {
    clientSpark.emit('init', { nodes: Nodes.all() })

    Nodes.getCharts()
  })

  clientSpark.on('client-pong', function (data) {
    var serverTime = _.get(data, 'serverTime', 0)
    var latency = Math.ceil((_.now() - serverTime) / 2)

    clientSpark.emit('client-latency', { latency: latency })
  })
})

setInterval(function () {
  client.write({
    action: 'client-ping',
    data: {
      serverTime: _.now()
    }
  })
}, 5000)

// Cleanup old inactive nodes
setInterval(function () {
  client.write({
    action: 'init',
    data: Nodes.all()
  })

  Nodes.getCharts()
}, 1000 * 60 * 60)

server.listen(process.env.PORT || 4080)

module.exports = server
