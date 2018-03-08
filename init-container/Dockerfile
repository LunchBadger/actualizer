FROM alpine
RUN echo http://dl-5.alpinelinux.org/alpine/v3.7/main > /etc/apk/repositories; \
    echo http://dl-5.alpinelinux.org/alpine/v3.7/community >> /etc/apk/repositories

RUN apk update && apk add openssh && apk add curl && apk add git