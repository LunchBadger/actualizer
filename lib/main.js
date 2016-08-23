'use strict';

let debug = require('debug')('actualizer:main');

let ConfigStoreClient = require('./csclient');
let ConsistencyError = require('./errors').ConsistencyError;
let CommsError = require('./errors').CommsError;
let kube = require('./kube');
let ProjectConfig = require('./project');
let sleep = require('./utils').sleep;

const CONFIGSTORE_URL = (process.env.CONFIGSTORE_URL ||
                         'http://localhost:3001/api');
const SLEEP_TIME = process.env.SLEEP_TIME || 1000;

async function _catchErrors(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConsistencyError || err instanceof CommsError) {
      debug(err.message);
      return null;
    } else {
      throw err;
    }
  }
}

async function reconcileProducers(configStore, deployer) {
  // debug('Checking config store');
  let producers = await _catchErrors(() => configStore.getAllProducers());
  if (!producers) {
    return;
  }

  // debug(`Reconciling ${producers.length} producers`);
  await Promise.all(producers.map(producer => {
    return _catchErrors(() => reconcileDeployments(configStore, deployer,
                                                   producer));
  }));
}

async function getConfigFile(configStore, producerId, env) {
  const fileName = `${env}/project.json`;
  const configStr = await configStore.getFile(producerId, env, fileName);
  if (!configStr) {
    throw new ConsistencyError(producerId, env, `file ${fileName} not found`);
  }
  return configStr;
}

function configToDeployments(configStr, producerId, env) {
  let objs = undefined;
  try {
    objs = JSON.parse(configStr);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new ConsistencyError(producerId, env, `bad JSON: ${err.message}`);
    }
    throw err;
  }

  return new ProjectConfig(objs).getDeployments();
}

async function reconcileDeployments(configStore, deployer, producer) {
  // TODO: check repo object format here
  let envs = Object.keys(producer.envs);

  // debug(`> Reconciling ${envs.length} environments`);

  for (const env of envs) {
    const wantedRev = producer.envs[env];
    const configStr = await getConfigFile(configStore, producer.id, env);
    const deployments = configToDeployments(configStr, producer.id, env);

    await deployer.updateEnvironment(producer.id, env, deployments, wantedRev);
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
      await reconcileProducers(configStore, deployer);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
    await sleep(SLEEP_TIME);
  }
};

module.exports = main;
module.exports.reconcileProducers = reconcileProducers;

if (require.main === module) {
  main();
}

