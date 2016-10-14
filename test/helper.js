let assert = require('assert');
let http = require('http');
let Promise = require('promise');
let path = require('path');
let fs = require('fs');
let _ = require('lodash');
let api = require('../lib/api');
let Intree = require('../lib/intree');
let taskcluster = require('taskcluster-client');
let mocha = require('mocha');
let exchanges = require('../lib/exchanges');
let load = require('../lib/main');
let slugid = require('slugid');
let config = require('typed-env-config');
let testing = require('taskcluster-lib-testing');
let validator = require('taskcluster-lib-validate');

// Load configuration
let cfg = config({profile: 'test'});

let testClients = {
  'test-server': ['*'],
  'test-client': ['*'],
};

// Create and export helper object
let helper = module.exports = {};

// Build an http request from a json file with fields describing
// headers and a body
helper.jsonHttpRequest = function(jsonFile, options) {
  let defaultOptions = {
    hostname: 'localhost',
    port: cfg.server.port,
    path: '/v1/github',
    method: 'POST',
  };

  options = _.defaultsDeep(options, defaultOptions);

  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;
  return new Promise (function(accept, reject) {
    try {
      let req = http.request(options, accept);
      req.write(JSON.stringify(jsonData.body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
};

let webServer = null;

// Setup before tests
mocha.before(async () => {
  testing.fakeauth.start(testClients);

  helper.validator = await validator({
    prefix: 'github/v1/',
    aws: cfg.aws,
  });

  webServer = await load('server', {profile: 'test', process: 'test'});

  helper.intree = await load('intree', {profile: 'test', process: 'test'});
  helper.queue = await load('queue', {profile: 'test', process: 'test'});

  // Configure pulse receiver
  helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);
  let exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.app.exchangePrefix,
    credentials:      cfg.pulse,
  });
  helper.TaskclusterGitHubEvents = taskcluster.createClient(exchangeReference);
  helper.taskclusterGithubEvents = new helper.TaskclusterGitHubEvents();

  // Configure pulse publisher
  helper.publisher = await load('publisher', {profile: 'test', process: 'test'});
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  testing.fakeauth.stop();
});
