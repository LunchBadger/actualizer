'use strict';

class Deployment {

  getDeploymentJson() {
    throw Error('not implemented');
  }

  getConfigMapJson(_locator, _configMapName) {
    throw Error('not implemented');
  }
};

module.exports = Deployment;
