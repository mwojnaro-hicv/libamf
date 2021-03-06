'use strict';

const path         = require('path');

const express      = require('express');
const bodyParser   = require('body-parser');

const Packet       = require('./Packet');
const EventEmitter = require('events');

class Server extends EventEmitter {
    /**
     * Create an AMF server
     * @param {Object} opts
     */
    constructor(opts = {}) {
        super();
        
        /**
         * @type {Number}
         */
        this.port = opts.port || 8080;

        /**
         * @type {String}
         */
        this.path = opts.path || '/';

        /**
         * XML crossdomain
         * @type {String}
         */
        this.crossdomain = opts.crossdomain || '<cross-domain-policy><allow-access-from domain="*" to-ports="*" /></cross-domain-policy>';

        /**
         * @type {Object}
         */
        this.services = {};

        /**
         * @type {Array<Function>}
         */
        this.middleware = [];

        this.init();
    }

    init() {
        this.app = express();

        this.app.use(bodyParser.raw({
            type: 'application/x-amf'
        }));


        if(!Server.DisableDefaultHome) {
            this.app.get('/', (req, res) => {
                res.sendFile(path.join(__dirname, 'static', 'index.html'));
            });
        }

        this.app.get('/crossdomain.xml', (req, res) => {
            res.set('Content-Type', 'text/xml');
            res.send(this.crossdomain);
        });

        this.app.post(this.path, this.processPacket.bind(this));
    }

    /**
     * @param {Number=} port
     * @param {Function=} cb
     */
    listen(port, cb) {
        return new Promise((resolve, reject) => {
            if(!cb && typeof port === 'function') {
                cb = port;
                port = this.port;
            }

            this.port = port;
            this.app.listen(port, () => {
                if(cb) {
                    cb();
                }

                resolve();
            });
        });
    }

    /**
     * @param {Service} service 
     */
    registerService(service) {
        this.services[service.name] = service;
    }

    /**
     * @returns {Object}
     */
    getServices() {
        return this.services;
    }

    /**
     * @returns {Array<Promise>}
     */
    promisifyMiddleware(packet) {
        const promises = [];

        this.middleware.forEach(middleware => {
            promises.push(new Promise((resolve, reject) => {
                middleware(packet, resolve);
            }));
        });

        return promises;
    }

    processPacket(req, res) {
        Packet.read(req, res).then(async packet => {
            const middleware = this.promisifyMiddleware(packet);

            for(const promise of middleware) {
                await promise;
            }

            this.emit('data', packet);

            for(const message of packet.messages) {
                const args = message.targetURI.split('.');
                const method = args.pop();
                const service = this.getServices()[args.join('.')];

                if(service) {
                    service.process(method, message, packet);
                }
            }
        });
    }

    /**
     * Adds middleware 
     * @param {Function} fn
     */
    use(fn) {
        if(typeof fn === 'function') {
            this.middleware.push(fn);
        } else {
            throw new Error('Invalid middleware function: ' + fn);
        }
    }
}

Server.DisableDefaultHome = false;

module.exports = Server;