#!/usr/bin/env nodejs
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const marked = require('marked')

let directories = function () {
  let result = [];
  [
    path.join(process.env.alastriaroot, 'DIRECTORY_REGULAR.md'),
    path.join(process.env.alastriaroot, 'DIRECTORY_VALIDATOR.md')
  ].forEach((file) => {
    let data = fs.readFileSync(file, {encoding: 'utf-8'})
    result = result.concat(createDirectory(data))
  })
  return result
}

let createDirectory = function (body) {
  let directory = []
  marked.setOptions({
    gfm: true,
    tables: true,
    sanitize: true,
    smartLists: true
  })
  const tokenList = marked.lexer(body)
  for (const token in tokenList) {
    if (tokenList[token]['type'] === 'table') {
      let table = tokenList[token]
      for (let row = 0; row < table.cells.length; row++) {
        let entry = {}
        for (let column = 0; column < table.header.length; column++) {
          const currentHeader = table.header[column].match(/^[\w]+/)[0].toLowerCase() // we could cache instead of mass-regexp here
          if (currentHeader === 'enode') {
            if (table.cells[row][column] !== undefined) {
              const ip = table.cells[row][column].match(/(\d+)\.(\d+).(\d+).(\d+)/)
              if (ip != null) {
                entry['ip'] = ip[0]
              }
            }
          }
          entry[currentHeader] = table.cells[row][column]
        }
        directory.push(entry)
      }
    }
  }
  return directory
}

module.exports = { directories }
