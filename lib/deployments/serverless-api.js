const Deployment = require('./base');

// eslint-disable-next-line max-len
const LBSLS_IMAGE = process.env.LBSLS_IMAGE || '410240865662.dkr.ecr.us-west-2.amazonaws.com/lb-sls-api';
const LBSLS_VERSION = process.env.LBSLS_VERSION || 'latest';
const CUSTOMER_NAMESPACE = process.env.CUSTOMER_NAMESPACE || 'customer';

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
    }];
  }

  getInitContainersSpec () {
    let cmd = 'apk update && apk add openssh && apk add curl && apk add git; '; // TODO: build spec container
    cmd += `ssh-keyscan -t rsa -H git.gitea >> ~/.ssh/known_hosts; `;
    cmd += `ssh-keygen -f ~/.ssh/id_rsa -t rsa -N ""; `;
    cmd += `curl -X POST http://git-api.default/users/${CUSTOMER_NAMESPACE}/${this.producer}/ssh -d '{"publicKey":"'"$(cat ~/.ssh/id_rsa.pub)"'"}'  -H "Content-type: application/json"; `;
    return [{
      name: 'init',
      image: 'alpine',
      command: ['sh', '-c', cmd],
      volumeMounts: [
        {
          mountPath: '/root/.ssh',
          name: 'ssh-volume'
        }
      ]
    }];
  }

  getContainerSpec () {
    return [{
      name: 'sls',
      image: `${LBSLS_IMAGE}:${LBSLS_VERSION}`,
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
