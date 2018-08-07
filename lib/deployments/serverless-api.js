const Deployment = require('./base');

// eslint-disable-next-line max-len
const LBSLS_IMAGE = process.env.LBSLS_IMAGE || '410240865662.dkr.ecr.us-west-2.amazonaws.com/lb-sls-api';
const LBSLS_VERSION = process.env.LBSLS_VERSION || 'latest';
const CUSTOMER_NAMESPACE = process.env.CUSTOMER_NAMESPACE || 'customer';
const GIT_INIT_IMAGE = '410240865662.dkr.ecr.us-west-2.amazonaws.com/git-init';
const GIT_INIT_VERSION = process.env.GIT_INIT_VERSION || 'latest';
const LBSLS_DEBUG_VERSION = process.env.LBSLS_DEBUG_VERSION || LBSLS_VERSION;
const usersInDebugMode = process.env.LB_DEBUG_USERS ? process.env.LB_DEBUG_USERS.split(',') : [];

module.exports = async function load (producer, env) {
  if (env !== 'dev') {
    return [];
  }

  return [new ServerlessAPIDeployment(producer, env)];
};

class ServerlessAPIDeployment extends Deployment {
  constructor (producer, env) {
    super();
    this.producer = producer;
    this.env = env;
  }

  getConfigFiles () {
    return {};
  }

  getServicePorts () {
    return [{
      port: 80,
      name: 'sls-api',
      targetPort: 4444,
      protocol: 'TCP'
    }];
  }

  getVolumes () {
    return [{
      name: 'ssh-volume',
      emptyDir: {}
    }, {
      name: 'workspace-volume',
      emptyDir: {}
    }];
  }

  getInitContainersSpec () {
    return [{
      name: 'init-ws',
      image: `${GIT_INIT_IMAGE}:${GIT_INIT_VERSION}`,
      env: [{
        name: 'GIT_HOST',
        value: 'git.gitea'
      }, {
        name: 'GIT_API_HOST',
        value: 'git-api.default'
      }, {
        name: 'USERNAME',
        value: this.producer
      }, {
        name: 'GIT_KEY_TYPE',
        value: 'sls-api'
      }, {
        name: 'CUSTOMER_NAMESPACE',
        value: CUSTOMER_NAMESPACE
      }, {
        name: 'GIT_REPO_URL',
        value: `git@git.gitea:customer-${this.producer}/functions.git`
      }, {
        name: 'DEBUG',
        value: 'sls:*'
      }],
      volumeMounts: [
        {
          mountPath: '/root/.ssh',
          name: 'ssh-volume'
        },
        {
          mountPath: '/usr/src/app/workspace',
          name: 'workspace-volume'
        }
      ]
    }];
  }

  getContainerSpec () {
    const version = usersInDebugMode.indexOf(this.producer) === -1 ? LBSLS_VERSION : LBSLS_DEBUG_VERSION;

    return [{
      name: 'sls',
      image: `${LBSLS_IMAGE}:${version}`,
      imagePullPolicy: 'Always',
      readinessProbe: {
        httpGet: {
          path: '/ping',
          port: 4444,
          scheme: 'HTTP'
        },
        initialDelaySeconds: 2,
        timeoutSeconds: 1,
        periodSeconds: 3,
        successThreshold: 3,
        failureThreshold: 3
      },
      env: [{
        name: 'GIT_URL',
        value: `git@git.gitea:${CUSTOMER_NAMESPACE}-${this.producer}/functions.git`
      }, {
        name: 'LB_ENV',
        value: this.env
      }, {
        name: 'LB_PRODUCER',
        value: this.producer
      }, {
        name: 'LB_TARGET_NAMESPACE',
        value: CUSTOMER_NAMESPACE
      }, {
        name: 'DEBUG',
        value: 'sls:*'
      }],
      ports: [{
        name: 'sls',
        containerPort: 4444
      }],
      volumeMounts: [{
        name: 'ssh-volume',
        readOnly: true,
        mountPath: '/root/.ssh'
      }, {
        mountPath: '/usr/src/app/workspace',
        name: 'workspace-volume'
      }]
    }];
  }

  getIngressRules (serviceName, domain) {
    return [ {
      host: `sls-${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          path: '/',
          backend: {
            serviceName: serviceName,
            servicePort: 80
          }
        }]
      }
    }];
  }

  getPartialLocator () {
    return {
      app: 'sls-api'
    };
  }

  getAnnotations () {
    return null;
  }
};
