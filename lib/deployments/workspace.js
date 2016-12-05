import Deployment from './base';

// eslint-disable-next-line max-len
const LBWS_IMAGE = '410240865662.dkr.ecr.us-west-2.amazonaws.com/lunchbadger-workspace';
const LBWS_VERSION = '0.0.3';

export default async function load(producer, env, _project, _configStore) {
  if (env !== 'dev') {
    return [];
  }

  return [new WorkspaceDeployment(producer, env)];
}

export class WorkspaceDeployment extends Deployment {

  constructor(producer, env) {
    super();
    this.producer = producer;
    this.env = env;
  }

  getConfigFiles() {
    return {};
  }

  getServicePorts() {
    return [{
      port: 80,
      name: 'project-api',
      targetPort: 'project-api',
      protocol: 'TCP'
    }, {
      port: 81,
      name: 'workspace-api',
      targetPort: 'workspace-api',
      protocol: 'TCP'
    }, {
      port: 5000,
      name: 'workspace',
      targetPort: 'workspace',
      protocol: 'TCP'
    }];
  }

  getContainerSpec() {
    return [{
      name: 'lunchbadger-workspace',
      image: `${LBWS_IMAGE}:${LBWS_VERSION}`,
      ports: [{
        name: 'project-api',
        containerPort: 3000
      }, {
        name: 'workspace-api',
        containerPort: 3001
      }, {
        name: 'workspace',
        containerPort: 5000
      }]
    }];
  }

  getVHost() {
    return `${this.producer}-${this.env}`;
  }

  getPartialLocator() {
    return {
      app: 'workspace'
    };
  }
};
