FROM node:8-alpine

RUN apk update && apk add git
RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
RUN apk del git

COPY . /usr/src/app
RUN npm run build

ENV NODE_ENV production

CMD [ "npm", "start" ]
