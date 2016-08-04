'use strict';

let debug = require('debug')('actualizer:main');

let ConfigStoreClient = require('./csclient');
let ConsistencyError = require('./errors').ConsistencyError;
let kube = require('./kube');
let ProjectConfig = require('./project');
let sleep = require('./utils').sleep;

const CONFIGSTORE_URL = 'http://localhost:3001/api';
const SLEEP_TIME = 1000;

async function reconcileRepos(configStore, deployer) {
  debug('Checking config store');
  let repos = await configStore.getAllRepos();

  debug(`Reconciling ${repos.length} repos`);
  let reconcileFn = reconcileDeployments.bind(null, configStore, deployer);
  await Promise.all(repos.map(reconcileFn));
}

async function getConfigFile(configStore, repoId, env) {
  const fileName = `${env}/project.json`;
  const configStr = await configStore.getFile(repoId, 'env/' + env, fileName);
  if (!configStr) {
    throw new ConsistencyError(`No ${fileName} found (${repoId}@${env})`);
  }
  return configStr;
}

function configToDeployments(configStr, repoId, env) {
  let objs = undefined;
  try {
    objs = JSON.parse(configStr);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new ConsistencyError(`Bad JSON (${repoId}@${env}): ` + err.message);
    }
    throw err;
  }

  return new ProjectConfig(objs).getDeployments();
}

async function reconcileDeployments(configStore, deployer, repo) {
  // TODO: check repo object format here
  let envs = Object.keys(repo.branches)
    .filter(name => name.startsWith('env/'))
    .map(name => name.substr(4));

  debug(`> Reconciling ${envs.length} environments`);

  for (let env of envs) {
    let configStr = await getConfigFile(configStore, repo.id, env);
    let deployments = configToDeployments(configStr, repo.id, env);

    for (const deployment of deployments) {
      let locator = Object.assign({
        producer: repo.id,
        environment: env,
      }, deployment.getPartialLocator());

      let wantedRev = repo.branches['env/' + env];
      let actualRev = await deployer.getConfigRev(locator);
      if (wantedRev === actualRev) {
        debug('Deployment', locator, `already at revision ${actualRev}`);
        continue;
      }

      debug('Updating', locator, `to ${wantedRev}`);
      await deployer.updateDeployment(locator, deployment, wantedRev,
                                      actualRev === null);
    }
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
    await sleep(SLEEP_TIME);
  }
};

module.exports = main;
module.exports.reconcileRepos = reconcileRepos;

if (require.main === module) {
  main();
}

