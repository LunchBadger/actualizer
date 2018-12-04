// This is what k8s uses to validate names, we also remove dashes from regex
const nameFilter = /[a-z0-9]([a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9]*[a-z0-9])?)*/gi;
const maxNameLength = 15;
module.exports = class Deployment {
  getDeploymentJson (_locator, _configMapName) {
    throw Error('not implemented');
  }

  prepareName (name, id) {
    const preparedId = id.replace(/-/g, '').slice(0, maxNameLength);
    if (!name) return preparedId;
    const parts = name.toLowerCase().match(nameFilter);
    if (!parts || parts.length === 0) return preparedId;
    const title = parts.join('');
    if (!title || title.length > maxNameLength) {
      return preparedId;
    }
    return title;
  }

  getConfigFiles () {
    throw Error('not implemented');
  }

  getVolumes () {
    throw Error('not implemented');
  }

  getServicePorts () {
    throw Error('not implemented');
  }

  getInitContainersSpec () {
    throw Error('not implemented');
  }

  getContainerSpec () {
    throw Error('not implemented');
  }

  getVHost () {
    throw Error('not implemented');
  }

  getPartialLocator () {
    throw Error('not implemented');
  }

  getAnnotations () {
    throw Error('not implemented');
  }
};
