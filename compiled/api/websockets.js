"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws = __importStar(require("ws")); //Done this way to avoid name clash
const jsonwebtoken_1 = require("jsonwebtoken");
class WSServer {
    constructor(httpServer, users, appKey, logListener) {
        this.wss = new ws.Server({ noServer: true });
        this.users = users;
        this.appKey = appKey;
        httpServer.on("upgrade", (req, sock, head) => {
            this.wss.handleUpgrade(req, sock, head, (client) => {
                this.wss.emit("connection", client, req);
            });
        });
        this.wss.on("connection", (sock) => {
            let uid = "";
            sock.on("message", (msg) => __awaiter(this, void 0, void 0, function* () {
                //Convert the msg from 
                let token = {}, tokenData = {};
                try {
                    token = JSON.parse(msg.toString());
                }
                catch (e) {
                    sock.send(JSON.stringify({
                        type: "auth",
                        content: `Error parsing token: ${e.message}. Closing.`
                    }));
                    return sock.close();
                }
                //Do type checking
                if (typeof token.type === "undefined" || token.type !== "auth") {
                    sock.send(JSON.stringify({
                        type: "auth",
                        content: `Invalid token type: ${token.type}. Closing.`
                    }));
                    return sock.close();
                }
                if (typeof token.content === "undefined") {
                    sock.send(JSON.stringify({
                        type: "auth",
                        content: "Token content not present. Closing."
                    }));
                    return sock.close();
                }
                //Parse out token
                try {
                    tokenData = yield (0, jsonwebtoken_1.verify)(token.content, this.appKey);
                    if (typeof tokenData.uid === "undefined") {
                        sock.send(JSON.stringify({
                            type: "auth",
                            content: "Invalid token format. Closing."
                        }));
                        return sock.close();
                    }
                    uid = tokenData.uid;
                }
                catch (e) {
                    sock.send(JSON.stringify({
                        type: "auth",
                        content: "Token signature missing or corrupted. Closing."
                    }));
                    return sock.close();
                }
                //Assign ws to user
                const user = users.getUserByID(uid);
                if (typeof user === "undefined") {
                    sock.send(JSON.stringify({
                        type: "auth",
                        content: `User ${uid} not found. Closing.`
                    }));
                    return sock.close();
                }
                user.ws = sock;
                return sock.send(JSON.stringify({
                    type: "auth",
                    content: "ok",
                    user: uid
                }));
            }));
            sock.on("close", (code, reason) => {
                //Remove ws from user
                const user = users.getUserByID(uid);
                if (typeof user !== "undefined")
                    user.ws = undefined;
            });
        });
        if (typeof logListener !== "undefined")
            logListener();
    }
    broadcastAll(message) {
        const payload = JSON.stringify({
            type: "broadcast",
            content: message
        });
        for (const user of this.users.getUserList()) {
            if (typeof user.ws !== "undefined")
                user.ws.send(payload);
        }
    }
}
exports.default = WSServer;
;
