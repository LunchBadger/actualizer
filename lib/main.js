'use strict';

let sleep = require('./utils').sleep;
let ConfigStoreClient = require('./csclient');
let kube = require('./kube');
let ConsistencyError = require('./utils').ConsistencyError;

const CONFIGSTORE_URL = 'http://localhost:3001/api';
const LOOP_PERIOD = 1000;

async function reconcileRepos(configStore, kubeWrapper) {
  console.log('Checking repos');
  let repos = await configStore.getAllRepos();
  console.log(`Reconciling ${repos.length} repos`);
  await Promise.all(
    repos.map(updateKubernetes.bind(null, configStore, kubeWrapper)));
}

async function updateKubernetes(configStore, kubeWrapper, repo) {
  let envs = Object.keys(repo.branches)
    .filter((name) => name.startsWith('env/'))
    .map((name) => name.substr(4));

  console.log(`> Reconciling ${envs.length} environments`);
  for (let env of envs) {
    let wantedRev = repo.branches['env/' + env];
    let actualRev = await kubeWrapper.getGatewayConfigRev(repo.id, env);
    if (wantedRev === actualRev) {
      console.log(`Repo ${repo.id} already at revision ${actualRev}`);
      continue;
    }

    let fileName = `${env}/gateway.json`;
    let gwCfg = await configStore.getFile(repo.id, 'env/' + env, `${fileName}`);
    if (!gwCfg) {
      throw new ConsistencyError(`No ${fileName} found (${repo.id}@${env})`);
    }
    console.log(`Set config: ${repo.id}@${env} to ${wantedRev}`);
    await kubeWrapper.setGatewayConfig(repo.id, env, gwCfg, wantedRev,
                                       actualRev === null);
  }
}

async function main() {
  process.on('unhandledRejection', (reason, _p) => {
    console.log(`Unhandled rejection ${reason.stack}`);
  });

  process.on('uncaughtException', (err) => {
    console.log(`Unhandled exception: ${err.stack}`);
  });

  let kubeWrapper = new kube.KubernetesWrapper();
  let configStore = new ConfigStoreClient(CONFIGSTORE_URL);
  console.log(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  while (true) {
    try {
      await reconcileRepos(configStore, kubeWrapper);
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

