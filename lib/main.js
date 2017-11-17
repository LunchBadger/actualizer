const debug = require('debug')('actualizer:main');
const request = require('request-promise');

const ConfigStoreClient = require('./csclient');
const kube = require('./kube');
const ProjectConfig = require('./project');
const {ConsistencyError, CommsError} = require('./errors');

const loadGateways = require('./deployments/gateway');
const loadWorkspaces = require('./deployments/workspace');

const SLEEP_TIME = process.env.SLEEP_TIME || 1000;
const CUSTOMER_DOMAIN = process.env.CUSTOMER_DOMAIN || 'lunchbadger.io';

const CONFIGSTORE_URL = process.env.CONFIGSTORE_URL ||
  'http://localhost:3002/api';

const WORKSPACE_API_URL_TEMPLATE = process.env.WORKSPACE_API_URL_TEMPLATE ||
  'http://internal-$PRODUCER-$ENV.' + CUSTOMER_DOMAIN + '/workspace-api/api';

class Actualizer {
  constructor (configStore, deployer, loaders) {
    this.configStore = configStore;
    this.deployer = deployer;
    this.loaders = loaders;
  }

  async reconcile () {
    debug('Checking config store');
    let producers = await this._catchErrors(() => {
      return this.configStore.getAllProducers();
    });
    if (!producers) {
      return;
    }

    debug(`Reconciling ${producers.length} producers`);
    await Promise.all(producers.map(producer => {
      return this._catchErrors(() => this.reconcileDeployments(producer));
    }));
  }

  async reconcileDeployments (producer) {
    // TODO: check repo object format here
    let envs = Object.keys(producer.envs);
    if (!envs.includes('dev')) {
      envs.push('dev');
    }

    debug(`Reconciling ${envs.length} environments`);

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

  async getProject (producerId, env) {
    const fileName = 'lunchbadger.json';
    debug(`Retrieving lunchbadger.json for ${producerId} from configstore.`);
    const configStr = await this.configStore.getFile(producerId, env, fileName);
    if (!configStr) {
      return null;
    }

    let objs;
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

  async getModels (producerID, env) {
    // need to use the workspace API, as it reflects what's
    // current
    const modelURL = WORKSPACE_API_URL_TEMPLATE
      .replace('$PRODUCER', producerID)
      .replace('$ENV', env) + '/ModelDefinitions';

    try {
      const res = await request({
        url: modelURL,
        json: true,
        simple: false,
        resolveWithFullResponse: true
      });

      if (res.statusCode !== 200) {
        return null;
      }

      return res.body;
    } catch (err) {
      debug('Error fetching models:', err.message);
      return null;
    }
  }

  async loadDeployments (producer, env, project, models) {
    let result = [];
    for (let loader of this.loaders) {
      let deployments = await loader(producer, env, project, models, this.configStore, CUSTOMER_DOMAIN);
      result.push(...deployments);
    }
    return result;
  }

  async _catchErrors (fn) {
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

module.exports = function main () {
  let count = 0;

  debug(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  const loop = async () => {
    count++;

    debug(`Reconciling Kubernetes resources. [count: ${count}]`);

    let deployer = new kube.Deployer({customerDomain: CUSTOMER_DOMAIN});
    let configStore = new ConfigStoreClient(CONFIGSTORE_URL);

    let loaders = [
      loadGateways,
      loadWorkspaces
    ];

    let actualizer = new Actualizer(configStore, deployer, loaders);

    await actualizer.reconcile();

    debug(`Completing reconciliation. [count: ${count}]`);

    setTimeout(loop, SLEEP_TIME);
  };

  loop();
};
module.exports.Actualizer = Actualizer;
