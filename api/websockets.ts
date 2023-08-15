import * as ws from "ws"; //Done this way to avoid name clash
import * as http from "http";
import { verify } from "jsonwebtoken";
import Users from "./market/users";

export default class WSServer {
    constructor(httpServer: http.Server, users: Users, appKey: string, logListener?: (() => void)) {
        this.wss = new ws.Server({noServer: true});
        this.users = users;
        this.appKey = appKey;

        httpServer.on("upgrade", (req, sock, head) => {
            this.wss.handleUpgrade(req, sock, head, (client) => {
                this.wss.emit("connection", client, req);
            });
        });

        this.wss.on("connection", (sock) => {
            
            let uid: string = "";

            sock.on("message", async (msg) => {
                
                //Convert the msg from 
                let token: any = {}, tokenData: any = {};
                try {

                    token = JSON.parse(msg.toString());

                } catch (e: any) {

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
        
                    tokenData = await verify(token.content, this.appKey);
        
                    if (typeof tokenData.uid === "undefined") {
                        sock.send(JSON.stringify({
                            type: "auth",
                            content: "Invalid token format. Closing."
                        }));
                        return sock.close();
                    }
                        
                    uid = tokenData.uid;
        
                } catch(e) {
        
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
            });

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


    broadcastAll(message: any) {

        const payload = JSON.stringify({
            type: "broadcast",
            content: message
        });

        for (const user of this.users.getUserList()) {
            if (typeof user.ws !== "undefined")
                user.ws.send(payload);
        }
    }

    payment(uid: string, message: any) {
        
    }

    private wss: ws.Server;
    private users: Users;
    private appKey: string;
};  