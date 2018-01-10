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
    // debug('Checking config store');
    const producers = await this._catchErrors(() => {
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

  async reconcileDeployments (producer) {
    // TODO: check repo object format here
    const envs = Object.keys(producer.envs);
    if (!envs.includes('dev')) {
      envs.push('dev');
    }

    // debug(`> Reconciling ${envs.length} environments`);
    for (const env of envs) {
      const wantedRev = producer.envs[env] || '0'.repeat(40);
      const project = await this.getProject(producer.id, env);
      let models = [];
      if ((await this.deployer.checkWorkspace({producer: producer.id, env}))) {
        models = await this.getModels(producer.id, env);
      } else {
        debug(`workspace for ${producer.id} in ${env} is not ready yet`);
      }
      const deployments =
        await this.loadDeployments(producer.id, env, project, models);

      await this.deployer.updateEnvironment(producer.id, env, deployments,
                                            wantedRev);
    }
  }

  async getProject (producerId, env) {
    const fileName = 'lunchbadger.json';
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
        timeout: 3000,
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
    const result = [];
    for (const loader of this.loaders) {
      const deployments = await loader(producer, env, project, models, this.configStore, CUSTOMER_DOMAIN);
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
  process.on('unhandledRejection', (reason, _p) => {
    debug(`Unhandled rejection ${reason.stack}`);
  });

  process.on('uncaughtException', (err) => {
    debug(`Unhandled exception: ${err.stack}`);
  });

  const deployer = new kube.Deployer({customerDomain: CUSTOMER_DOMAIN});
  const configStore = new ConfigStoreClient(CONFIGSTORE_URL);
  const loaders = [
    loadGateways,
    loadWorkspaces
  ];
  const actualizer = new Actualizer(configStore, deployer, loaders);

  debug(`Monitoring configstore at ${CONFIGSTORE_URL}`);

  const loop = async () => {
    try {
      await actualizer.reconcile();
      setTimeout(loop, SLEEP_TIME);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    }
  };

  loop();
};
module.exports.Actualizer = Actualizer;
