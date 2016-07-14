'use strict';

let sleep = require('./utils').sleep;
let ConfigStoreClient = require('./csclient');
let kube = require('./kube');
let ConsistencyError = require('./errors').ConsistencyError;
let debug = require('debug')('acutalizer::main');

const CONFIGSTORE_URL = 'http://localhost:3001/api';
const LOOP_PERIOD = 1000;

async function reconcileRepos(configStore, deployer) {
  debug('Checking repos');
  let repos = await configStore.getAllRepos();
  debug(`Reconciling ${repos.length} repos`);
  await Promise.all(
    repos.map(updateGateways.bind(null, configStore, deployer)));
}

async function updateGateways(configStore, deployer, repo) {
  let envs = Object.keys(repo.branches)
    .filter((name) => name.startsWith('env/'))
    .map((name) => name.substr(4));

  debug(`> Reconciling ${envs.length} environments`);
  for (let env of envs) {
    let locator = {
      producer: repo.id,
      environment: env,
      app: 'gateway'
    };
    let wantedRev = repo.branches['env/' + env];
    let actualRev = await deployer.getConfigRev(locator);
    if (wantedRev === actualRev) {
      debug('Deployment', locator, `already at revision ${actualRev}`);
      continue;
    }

    let fileName = `${env}/gateway.json`;
    let gwCfg = await configStore.getFile(repo.id, 'env/' + env, `${fileName}`);
    if (!gwCfg) {
      throw new ConsistencyError(`No ${fileName} found (${repo.id}@${env})`);
    }
    debug('Updating', locator, `to ${wantedRev}`);
    await deployer.setConfig(locator, gwCfg, wantedRev, actualRev === null);
  }
}

async function main() {
  process.on('unhandledRejection', (reason, _p) => {
    debug(`Unhandled rejection ${reason.stack}`);
  });

  process.on('uncaughtException', (err) => {
    debug(`Unhandled exception: ${err.stack}`);
  });

  let deployer = new kube.Deployer();
  let configStore = new ConfigStoreClient(CONFIGSTORE_URL);
  debug(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  while (true) {
    try {
      await reconcileRepos(configStore, deployer);
    } catch (err) {
      debug('Error happened:', err.message);
    }

    break;

    await sleep(LOOP_PERIOD);
  }
};
module.exports = main;
module.exports.reconcileRepos = reconcileRepos;

if (require.main === module) {
  main();
}

