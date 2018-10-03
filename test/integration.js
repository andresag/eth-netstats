#!/usr/bin/env nodejs
const nodes = require('./nodes').directories()
const cluster = require('cluster')
require('dotenv').config()

if (cluster.isMaster) {
  if (process.argv.includes('all')) {
    console.log('testing using all nodes')
    for (let i = 0; i < nodes.length; i++) {
      const env = {
        NODE_ENV: 'production',
        RPC_HOST: nodes[i].ip,
        RPC_PORT: '22000',
        LISTENING_PORT: '21000',
        INSTANCE_NAME: nodes[i].entidad,
        CONTACT_DETAILS: nodes[i].contacto,
        WS_SERVER: 'ws://127.0.0.1:3000',
        WS_SECRET: 'secret',
        VERBOSITY: '2'
      }
      cluster.fork(env)
    }
  } else {
    console.log('testing using just one node')
    const envlocal = {
      NODE_ENV: 'production',
      RPC_HOST: process.env.testnode,
      RPC_PORT: '22000',
      LISTENING_PORT: '21000',
      INSTANCE_NAME: 'test_node',
      CONTACT_DETAILS: 'contact_details',
      WS_SERVER: 'ws://127.0.0.1:3000',
      WS_SECRET: 'secret',
      VERBOSITY: '3'
    }
    cluster.fork(envlocal)
  }
  process.env['WS_SECRET'] = 'secret'
  require('../server')
} else {
  require('eth-net-intelligence-api/app.js')
}
