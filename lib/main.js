import dbg from 'debug';
import request from 'request-promise';

const debug = dbg('actualizer:main');

import ConfigStoreClient from './csclient';
import kube from './kube';
import ProjectConfig from './project';
import {ConsistencyError, CommsError} from './errors';
import {sleep} from './utils';

import loadGateways from './deployments/gateway';
import loadWorkspaces from './deployments/workspace';

const SLEEP_TIME = process.env.SLEEP_TIME || 1000;
const CUSTOMER_DOMAIN = process.env.CUSTOMER_DOMAIN || 'lunchbadger.io';

const CONFIGSTORE_URL = process.env.CONFIGSTORE_URL ||
  'http://localhost:3002/api';

const WORKSPACE_API_URL_TEMPLATE = process.env.WORKSPACE_API_URL_TEMPLATE ||
  'http://internal-${PRODUCER}-${ENV}.' + CUSTOMER_DOMAIN + '/workspace-api/api';

export class Actualizer {
  constructor(configStore, deployer, loaders) {
    this.configStore = configStore;
    this.deployer = deployer;
    this.loaders = loaders;
  }

  async reconcile() {
    // debug('Checking config store');
    let producers = await this._catchErrors(() => {
      return this.configStore.getAllProducers();
    });
    if (!producers) {
      return;
    }

    // debug(`Reconciling ${producers.length} producers`);
    await Promise.all(producers.map(producer => {
      return this._catchErrors(() => this.reconcileDeployments(producer));
    }));
  }

  async reconcileDeployments(producer) {
    // TODO: check repo object format here
    let envs = Object.keys(producer.envs);
    if (!envs.includes('dev')) {
      envs.push('dev');
    }

    // debug(`> Reconciling ${envs.length} environments`);

    for (const env of envs) {
      const wantedRev = producer.envs[env] || '0'.repeat(40);
      const project = await this.getProject(producer.id, env);
      const models = await this.getModels(producer.id, env);
      const deployments =
        await this.loadDeployments(producer.id, env, project, models);

      await this.deployer.updateEnvironment(producer.id, env, deployments,
                                            wantedRev);
    }
  }

  async getProject(producerId, env) {
    const fileName = 'lunchbadger.json';
    const configStr = await this.configStore.getFile(producerId, env, fileName);
    if (!configStr) {
      return null;
    }

    let objs = undefined;
    try {
      objs = JSON.parse(configStr);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new ConsistencyError(producerId, env, `bad JSON: ${err.message}`);
      }
      throw err;
    }

    return new ProjectConfig(producerId, env, objs);
  }

  async getModels(producerID, env) {
    // need to use the workspace API, as it reflects what's
    // current
    const workspaceID = `${producerID}-${env}`;
    const modelURL = WORKSPACE_API_URL_TEMPLATE
      .replace('${PRODUCER}', producerID)
      .replace('${ENV}', env) + '/ModelDefinitions';

    const res = await request({
      url: modelURL,
      json: true,
      simple: false,
      resolveWithFullResponse: true
    });

    if (res.statusCode === 404) {
      return null;
    } else if (res.statusCode !== 200) {
      throw new Error(`got status ${res.statusCode}`);
    }

    return res.body;
  }

  async loadDeployments(producer, env, project, models) {
    let result = [];
    for (let loader of this.loaders) {
      let deployments = await loader(producer, env, project, models, this.configStore, CUSTOMER_DOMAIN);
      result.push(...deployments);
    }
    return result;
  }

  async _catchErrors(fn) {
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
}

export default async function main() {
  process.on('unhandledRejection', (reason, _p) => {
    debug(`Unhandled rejection ${reason.stack}`);
  });

  process.on('uncaughtException', (err) => {
    debug(`Unhandled exception: ${err.stack}`);
  });

  let deployer = new kube.Deployer({customerDomain: CUSTOMER_DOMAIN});
  let configStore = new ConfigStoreClient(CONFIGSTORE_URL);
  let loaders = [
    loadGateways,
    loadWorkspaces
  ];
  let actualizer = new Actualizer(configStore, deployer, loaders);

  debug(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  while (true) {
    try {
      await actualizer.reconcile();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
    await sleep(SLEEP_TIME);
  }
};

if (require.main === module) {
  main();
}

