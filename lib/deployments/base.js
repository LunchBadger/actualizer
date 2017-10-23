module.exports = class Deployment {

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

  getVHost() {
    throw Error('not implemented');
  }

  getPartialLocator() {
    throw Error('not implemented');
  }
};
