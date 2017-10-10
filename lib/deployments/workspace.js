import Deployment from './base';

// eslint-disable-next-line max-len
const LBWS_IMAGE = '410240865662.dkr.ecr.us-west-2.amazonaws.com/lunchbadger-workspace';
const LBWS_VERSION = process.env.LBWS_VERSION || '0.0.8-alpha';

export default async function load(producer, env) {
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
      port: 3000,
      name: 'workspace',
      targetPort: 'workspace',
      protocol: 'TCP'
    }];
  }

  getVolumes() {
    return [{
      name: 'keypair-volume',
      secret: {
        secretName: 'triton-keypair'
      }
    }];
  }

  getContainerSpec() {
    return [{
      name: 'lunchbadger-workspace',
      image: `${LBWS_IMAGE}:${LBWS_VERSION}`,
      imagePullPolicy: 'Always',
      env: [{
        name: 'GIT_URL',
        value: `http://configstore.default/git/${this.producer}.git`
      }, {
        name: 'LB_ENV',
        value: this.env
      }, {
        name: 'WATCH_URL',
        value: `http://configstore.default/api/producers/${this.producer}/change-stream`
      }, {
        name: 'DEBUG',
        value: 'lunchbadger-workspace:*'
      }],
      ports: [{
        name: 'project-api',
        containerPort: 4230
      }, {
        name: 'workspace-api',
        containerPort: 4231
      }, {
        name: 'workspace',
        containerPort: 3000
      }],
      volumeMounts: [{
        name: 'keypair-volume',
        readonly: true,
        mountPath: '/root/.ssh',
      }]
    }];
  }

  getIngressRules(serviceName, domain) {
    return [{
      host: `${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 3000
          }
        }]
      }
    }, {
      host: `internal-${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          path: '/project-api',
          backend: {
            serviceName: serviceName,
            servicePort: 80
          }
        }, {
          path: '/workspace-api',
          backend: {
            serviceName: serviceName,
            servicePort: 81
          }
        }]
      }
    }];
  }

  getPartialLocator() {
    return {
      app: 'workspace'
    };
  }
};
