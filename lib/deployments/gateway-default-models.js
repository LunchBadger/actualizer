module.exports = {
  'users.json': {
    '$id': 'http://express-gateway.io/models/users.json',
    'type': 'object',
    'properties': {
      'firstname': {
        'type': 'string'
      },
      'lastname': {
        'type': 'string'
      },
      'username': {
        'type': 'string'
      },
      'email': {
        'type': 'string',
        'format': 'email'
      },
      'redirectUri': {
        'type': 'string',
        'format': 'uri'
      }
    },
    'required': [
      'username',
      'firstname',
      'lastname'
    ]
  },
  'credentials.json': {
    '$id': 'http://express-gateway.io/models/credentials.json',
    'type': 'object',
    'definitions': {
      'credentialBase': {
        'type': 'object',
        'properties': {
          'autoGeneratePassword': {
            'type': 'boolean',
            'default': true
          },
          'scopes': {
            'type': [
              'string',
              'array'
            ],
            'items': {
              'type': 'string'
            }
          }
        },
        'required': [
          'autoGeneratePassword'
        ]
      }
    },
    'properties': {
      'basic-auth': {
        'allOf': [
          {
            '$ref': '#/definitions/credentialBase'
          },
          {
            'type': 'object',
            'properties': {
              'passwordKey': {
                'type': 'string',
                'default': 'password'
              }
            },
            'required': [
              'passwordKey'
            ]
          }
        ]
      },
      'key-auth': {
        'type': 'object',
        'properties': {
          'scopes': {
            'type': [
              'string',
              'array'
            ],
            'items': {
              'type': 'string'
            }
          }
        }
      },
      'jwt': {
        'type': 'object',
        'properties': {}
      },
      'oauth2': {
        'allOf': [
          {
            '$ref': '#/definitions/credentialBase'
          },
          {
            'type': 'object',
            'properties': {
              'passwordKey': {
                'type': 'string',
                'default': 'secret'
              }
            },
            'required': [
              'passwordKey'
            ]
          }
        ]
      }
    }
  },
  'applications.json': {
    '$id': 'http://express-gateway.io/models/applications.json',
    'type': 'object',
    'properties': {
      'name': {
        'type': 'string'
      },
      'redirectUri': {
        'type': 'string',
        'format': 'uri'
      }
    },
    'required': [
      'name'
    ]
  }
};
