//
// (c) vgeffer, 2023
//
//  Class containing code handling users - connections, passwords, names, etc...
//
import * as argon2 from "argon2";
import { randomUUID, randomBytes } from "crypto";
import { Request, Response } from "express";
import { readFileSync, writeFileSync } from "fs";
import { sign, verify } from "jsonwebtoken";
import { WebSocket } from "ws";

import { portfolio } from "./market";

export interface User {
    
    name: string;   //Username
    pass: string;   //Password hash
    usid: string;   //User UUID

    merchant: boolean; //Is merchant? (veduci)
    bot: boolean;

    ws?: WebSocket; //WebSocket Connection
    portfolio?: portfolio;
    uniqueToken?: string; //Connection token
};

export default class Users {
    constructor(appKey: string, defaultUsersPath: string = "./users.json") {
        this.userList = [];
        this.appKey = appKey;

        //Try to read users from file
        try {

            const userJSON = readFileSync(defaultUsersPath, {encoding: 'utf-8'});
            this.userList = JSON.parse(userJSON);

        } catch(e) {

            //File prolly does not exist
            this.userList = []; //Just for safety, if some garbage has been written here by JSON.parse

        }
    }

    async auth(req: Request, res: Response) {

        if (typeof req.body === "undefined")
            return res.status(400).send("400: request has no body");

        const msg = req.body;

        if (typeof msg.type === "undefined")
            return res.status(400).send("400: wrong message format");


        if (msg.type === "register") {

            if (typeof msg.name === "undefined" || typeof msg.passwd === "undefined" || msg.name === "")
                return res.status(400).send("400: no user specified");

            if (msg.passwd.length < 8)
                return res.status(400).send("400: password shorter than 8 characters");

            //Register new user

            try {

                const user = await this.createUser(msg.name, msg.passwd);

                //Create cookies
                const tradeCookie = sign({
                    type: 'trade',
                    nonce: user.uniqueToken,
                    uid: user.usid
                }, this.appKey, { expiresIn: '24h'});

                res.cookie("tradeBiscuit", tradeCookie, {
                    maxAge: 12 * 60 * 60 * 1000,
                    httpOnly: true,
                    sameSite: true
                });

                return res.status(200).send("200: ok");

            } catch (err: any) {

                return res.status(400).send(`400: ${err.message}`);
            }
        }
        else if (msg.type === "login") {

            if ( typeof msg.name === "undefined" || typeof msg.passwd === "undefined")
                return res.status(400).send("400: no user specified");
            
            for (const user of this.userList) {

                if (user.name === msg.name) {
                    if (await argon2.verify(user.pass, msg.passwd)) { //Done this way so we potentialy don't calculate hash on every single user's passwd

                        if(user.bot)
                            return res.status(400).send("400: Not Human");

                        //You can only become a merchant after you register, so there is no need to overcomplicate things
                        if (user.merchant) {

                            user.uniqueToken = randomBytes(8).toString("base64");

                            const merchantCookie = sign({
                                type: 'merchant',
                                nonce: user.uniqueToken,
                                uid: user.usid
                            }, this.appKey, { expiresIn: '24h'});
                        
                            res.cookie("travellingSalesman", merchantCookie, {
                                maxAge: 12 * 60 * 60 * 1000,
                                httpOnly: true,
                                sameSite: true
                            });
                    
                            return res.status(302).send("302: Merchant Login OK!");
                        }


                        user.uniqueToken = randomBytes(8).toString("base64");
                        
                        //Create cookies
                        const tradeCookie = sign({
                            type: 'trade',
                            nonce: user.uniqueToken,
                            uid: user.usid
                        }, this.appKey, { expiresIn: '24h'});
                    
                        res.cookie("tradeBiscuit", tradeCookie, {
                            maxAge: 12 * 60 * 60 * 1000,
                            httpOnly: true,
                            sameSite: true
                        });
                
                        return res.status(200).send("200: ok");
                    }
                    else 
                        return res.status(401).send("401: unauthorized");
                }
            }
            return res.status(401).send("401: unauthorized");
        }

        else if (msg.type === "reauth") {

            const uid = await this.verifyUser(req.cookies.tradeBiscuit);

            if (uid === null) //Null: user is already logged in elsewhere
                return res.status(409).send("409: logged in elsewhere");
    
            if (typeof uid === "undefined") //Undefined: User not found
                return res.status(401).send("401: auth failed");
    
            const user = this.getUserByID(uid);
            if (typeof user === "undefined")
                return res.status(401).send("401: user not found");
                    
            const infoNonce = sign({
                uid: uid,
                nonce: randomBytes(32).toString('base64')
            }, this.appKey, { expiresIn: '1h' });
        
            return res.status(200).send(infoNonce);
        }

        else 
            return res.status(400).send("400: bad request");    
    }   

    async logout(req: Request, res: Response) {


        res.cookie("tradeBiscuit", "logout", {
            maxAge: 0,
            httpOnly: true,
            sameSite: true
        });
        res.redirect("/index.html");
    }

    async getPortfolio(req: Request, res: Response) {
               
        const uid = await this.verifyUser(req.cookies.tradeBiscuit);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        const user = this.getUserByID(uid);
        if (typeof user === "undefined")
            return res.status(401).send("401: user not found");

        if (typeof user.portfolio === "undefined")
            return res.status(400).send("400: user does not have a portfolio");

        return res.status(200).send(JSON.stringify(user.portfolio));
    }
    
    async verifyUser(cookie: string | undefined) {

        if (typeof cookie === "undefined")
            return undefined; //Undefined = invalid cookie

        let cookieData: any = {};
        try {

            cookieData = await verify(cookie, this.appKey);
            if (typeof cookieData.type === "undefined" || cookieData.type !== "trade")
                return undefined;

            if (typeof cookieData.uid === "undefined" || typeof cookieData.nonce === "undefined")
                return undefined;

            const user = this.getUserByID(cookieData.uid);
            
            if (typeof user === "undefined")
                return undefined; //User not found
                    
            if (cookieData.nonce === user.uniqueToken)
                    return cookieData.uid;
                else return null; //Null = user already logged in

        } catch(e) {

            return undefined;    
        }
    }

    save(defaultUsersPath: string = "./users.json"): boolean {

        try {

            const userJSON = JSON.stringify(this.userList, ["name", "pass", "usid", "merchant", "portfolio", "bot"]); //Skip saving the whole WebSocket Object
            writeFileSync(defaultUsersPath, userJSON, {encoding:'utf-8'});
            return true;

        } catch(e) {

            return false;

        }
    }

    getUserList() {
        return this.userList;
    }
    
    getUserByID(uid: string): User | undefined {

        for (const user of this.userList) {
            if (user.usid === uid)
                return user;
        }

        return undefined;
    }

    async createUser(username: string, passwd: string) {

        for (const user of this.userList) {
            if (user.name === username)
                throw new Error("409: user already exists");
        }

        //Calculate password hash
        const passhash  = await argon2.hash(passwd);
        const usid      = randomUUID();
        const uniqueToken = randomBytes(8).toString("base64");

        const newUser: User = {
            name: username,
            pass: passhash,
            usid: usid,
            uniqueToken: uniqueToken,
            merchant: false,
            bot: false,
            portfolio: {
                assets: {},
                cash: 0
            }
        };

        this.userList.push(newUser);
        return newUser;
    }

    private userList: User[];
    private appKey: string;
};