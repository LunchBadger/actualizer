'use strict';

let sleep = require('./utils').sleep;
let ConfigStoreClient = require('./csclient');
let kube = require('./kube');
let ConsistencyError = require('./utils').ConsistencyError;

const CONFIGSTORE_URL = 'http://localhost:3001/api';
const LOOP_PERIOD = 1000;

async function reconcileRepos(configStore, deployer) {
  console.log('Checking repos');
  let repos = await configStore.getAllRepos();
  console.log(`Reconciling ${repos.length} repos`);
  await Promise.all(
    repos.map(updateGateways.bind(null, configStore, deployer)));
}

async function updateGateways(configStore, deployer, repo) {
  let envs = Object.keys(repo.branches)
    .filter((name) => name.startsWith('env/'))
    .map((name) => name.substr(4));

  console.log(`> Reconciling ${envs.length} environments`);
  for (let env of envs) {
    let locator = {
      producer: repo.id,
      environment: env,
      app: 'gateway'
    };
    let wantedRev = repo.branches['env/' + env];
    let actualRev = await deployer.getConfigRev(locator);
    if (wantedRev === actualRev) {
      console.log('Deployment', locator, `already at revision ${actualRev}`);
      continue;
    }

    let fileName = `${env}/gateway.json`;
    let gwCfg = await configStore.getFile(repo.id, 'env/' + env, `${fileName}`);
    if (!gwCfg) {
      throw new ConsistencyError(`No ${fileName} found (${repo.id}@${env})`);
    }
    console.log('Updating', locator, `to ${wantedRev}`);
    await deployer.setConfig(locator, gwCfg, wantedRev, actualRev === null);
  }
}

async function main() {
  process.on('unhandledRejection', (reason, _p) => {
    console.log(`Unhandled rejection ${reason.stack}`);
  });

  process.on('uncaughtException', (err) => {
    console.log(`Unhandled exception: ${err.stack}`);
  });

  let deployer = new kube.Deployer();
  let configStore = new ConfigStoreClient(CONFIGSTORE_URL);
  console.log(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  while (true) {
    try {
      await reconcileRepos(configStore, deployer);
    } catch (err) {
      console.error('Error happened:', err.message);
    }

    break;

    await sleep(LOOP_PERIOD);
  }
};
module.exports = main;

if (require.main === module) {
  main();
}

