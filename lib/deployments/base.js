'use strict';

class Deployment {

  getDeploymentJson(_locator, _configMapName) {
    throw Error('not implemented');
  }

  getConfigFiles() {
    throw Error('not implemented');
  }

  getServicePorts() {
    throw Error('not implemented');
  }

  getContainerSpec() {
    throw Error('not implemented');
  }
};

module.exports = Deployment;
