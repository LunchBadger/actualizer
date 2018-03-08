FROM node:8-alpine

RUN apk update && apk add git
RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app
ENV NODE_ENV production

COPY package.json /usr/src/app/
RUN npm install
RUN apk del git

COPY . /usr/src/app


CMD [ "npm", "start" ]
