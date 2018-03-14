FROM node:8

ENV NODE_ENV production

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app
ENV NODE_ENV production

COPY package.json package-lock.json /usr/src/app/
RUN npm install

COPY . /usr/src/app

FROM node:8-alpine
ENV NODE_ENV production
COPY --from=0 /usr/src/app /usr/src/app
WORKDIR /usr/src/app

CMD [ "npm", "start" ]
