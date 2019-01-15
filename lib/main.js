const debug = require('debug')('actualizer:main');
const request = require('request-promise');

const ConfigStoreClient = require('./csclient');
const kube = require('./kube');
// const util = require('util');
const ProjectConfig = require('./project');
const {ConsistencyError} = require('./errors');

const loadGateways = require('./deployments/gateway');
const loadWorkspaces = require('./deployments/workspace');
const loadServerlessAPIs = require('./deployments/serverless-api');

const SLEEP_TIME = process.env.SLEEP_TIME || 1000;
const CUSTOMER_DOMAIN = process.env.CUSTOMER_DOMAIN || 'lunchbadger.io';

const CONFIGSTORE_URL = process.env.CONFIGSTORE_URL ||
  'http://localhost:3002';

const WORKSPACE_API_URL_TEMPLATE = process.env.WORKSPACE_API_URL_TEMPLATE ||
  'http://internal-$PRODUCER-$ENV.' + CUSTOMER_DOMAIN + '/workspace-api/api';

const OPEN_API_URL_TEMPLATE = process.env.OPEN_API_URL_TEMPLATE ||
  'http://workspace-$PRODUCER-$ENV.' + 'customer' + ':3000/explorer/swagger.json';

// TODO: it is strange to request data over ingress, it should be service URL for all entities
const SLS_API_URL_TEMPLATE = process.env.SLS_API_URL_TEMPLATE ||
  'http://sls-$PRODUCER-$ENV.' + CUSTOMER_DOMAIN;

class Actualizer {
  constructor (configStore, deployer, loaders) {
    this.configStore = configStore;
    this.deployer = deployer;
    this.loaders = loaders;
  }

  async reconcile () {
    const startTime = Date.now();
    let producers;
    try {
      producers = await this.configStore.getAllProducers();
      console.log('producers');
      console.log(producers);
      const runningProds = await this.deployer.listRunningProducers({env: 'dev'});
      console.log(runningProds);
      for (const prod of runningProds) {
        if (!producers.some(x => x.username === prod)) {
          console.log('BBB producer needs to be removed', prod);
        }
      }
    } catch (err) {
      debug('Failed to retrieve producers', err);
      return;
    }
    if (!producers || !producers.length) {
      debug(`No producers to reconcile, check configstore for error`);
      return;
    }

    debug(`Reconciling ${producers.length} producers`);
    await Promise.all(producers.map(producer => {
      return this.reconcileDeployments(producer);
    }));

    // REF numbers : 15 users and no changes => 0.5-1sec/cycle
    // Massive update of 15 users (docker image change) < 5 sec/cycle
    debug(`Reconciling Finished in ${(Date.now() - startTime) / 1000} seconds`);
  }

  async reconcileDeployments (producer) {
    const envs = [];
    if (!envs.includes('dev')) {
      envs.push('dev');
    }

    for (const env of envs) {
      const wantedRev = /* producer.envs[env] || */ '0'.repeat(40);

      let project;
      try {
        project = await this.getProject(producer.name, env);
      } catch (err) {
        debug('Failed to load project state', err);
        return;
      }

      let deployments = [];

      // TODO replace with some licence
      if (!project.disabled) {
        let models = [];
        let openAPISpec;
        if ((await this.deployer.checkWorkspace({producer: producer.name, env}))) {
          models = await this.getModels(producer.name, env);
          openAPISpec = await this.getOpenAPISpec(producer.name, env);
        } else {
          debug(`workspace for ${producer.name} in ${env} is not ready yet`);
        }
        let slsFunctions = await this.getSLS({producerID: producer.name, env});

        slsFunctions = slsFunctions || [];
        deployments = await this.loadDeployments({ producer: producer.name, env, project, models, slsFunctions, openAPISpec });
      }
      await this.deployer.updateEnvironment(producer.name, env, deployments,
                                            wantedRev);
    }
  }

  async getProject (producerId, env) {
    const fileName = 'lunchbadger.json';
    const configStr = await this.configStore.getFile(producerId, env, fileName);
    if (!configStr) {
      return null;
    }

    try {
      const objs = JSON.parse(configStr);
      return new ProjectConfig(producerId, env, objs);
    } catch (err) {
      debug(err);
      if (err instanceof SyntaxError) {
        throw new ConsistencyError(producerId, env, `bad JSON: ${err.message}`);
      }
      throw err;
    }
  }

  async getSLS ({producerID, env}) {
    const slsURL = SLS_API_URL_TEMPLATE
      .replace('$PRODUCER', producerID)
      .replace('$ENV', env) + '/service';

    try {
      const res = await request({
        url: slsURL,
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
      debug('Error fetching sls functions:', err);
      return null;
    }
  }

  async getModels (producerID, env) {
    // need to use the workspace API, as it reflects what's
    // current
    const modelURL = WORKSPACE_API_URL_TEMPLATE
      .replace('$PRODUCER', producerID)
      .replace('$ENV', env) + '/ModelDefinitions';
    debug('Model URL', modelURL);
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
      debug('Error fetching models:', err);
      return null;
    }
  }

  async getOpenAPISpec (producerID, env) {
    // need to use the workspace API, as it reflects what's
    // current
    const specURL = OPEN_API_URL_TEMPLATE
      .replace('$PRODUCER', producerID)
      .replace('$ENV', env);
    debug('Model URL', specURL);
    try {
      const res = await request({
        url: specURL,
        json: true,
        timeout: 5000,
        simple: false,
        resolveWithFullResponse: true
      });

      if (res.statusCode !== 200) {
        return null;
      }

      return res.body;
    } catch (err) {
      debug('Error fetching open api spec:', specURL, err);
      return null;
    }
  }

  async loadDeployments ({producer, env, project, models, slsFunctions, openAPISpec}) {
    const result = [];
    for (const loader of this.loaders) {
      try {
        const deployments = await loader(producer, env, project, models, this.configStore, CUSTOMER_DOMAIN, slsFunctions, openAPISpec);
        result.push(...deployments);
      } catch (err) {
        debug('Error creating deployment', err, producer, project);
      }
    }
    return result;
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
    loadWorkspaces,
    loadServerlessAPIs
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
