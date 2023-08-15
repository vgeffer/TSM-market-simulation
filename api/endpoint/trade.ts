import { Request, Response } from "express";
import Market, { orderType } from "./../market/market"; 
import Users from "../market/users";
import WSServer from "../websockets";


export default class TradeEndpoints{

    constructor(market: Market, users: Users, websock: WSServer) {
        this.market = market;
        this.users = users;
        this.websock = websock;
    }

    buy(req: Request, res: Response): any {
        this.createOrder(req, res, orderType.BUY);
    }

    sell(req: Request, res: Response): any {
        this.createOrder(req, res, orderType.SELL);
    }

    cancel(req: Request, res: Response): any {
        this.cancelOrder(req, res);
    }

    private async createOrder(req: Request, res: Response, type: orderType) {
        
        const uid = await this.users.verifyUser(req.cookies.tradeBiscuit);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        const orderingUser = this.users.getUserByID(uid);

        if (typeof orderingUser === "undefined")
            return res.status(401).send("401: user not found");

        if (typeof orderingUser.portfolio === "undefined")
            return res.status(400).send("400: user has no portfolio");

        if (type === orderType.BUY) {
            if (orderingUser.portfolio.cash < Number(req.params.price))
                return res.status(403).send("403: out of sync"); //This can only occur when client and server are out of sync
            
            orderingUser.portfolio.cash -= Number(req.params.price);
        }
        
        else {
            if (typeof orderingUser.portfolio.assets[req.params.stock] === "undefined" || orderingUser.portfolio.assets[req.params.stock] < Number(req.params.amount))
                return res.status(403).send("403: out of sync");

            orderingUser.portfolio.assets[req.params.stock] -= Number(req.params.amount);
        }

        const orderid = this.market.addOrder(
            uid,
            type, 
            req.params.stock, 
            Number(req.params.amount),
            Number(req.params.price)
        );

        if (orderid === null) {
        
            //Recover any locked resources
            if (type === orderType.BUY) 
                orderingUser.portfolio.cash += Number(req.params.price);
            else 
                orderingUser.portfolio.assets[req.params.stock] += Number(req.params.amount);    

            return res.status(400).send("400: bad request");
        }


        return res.status(200).send(orderid);
    }


    private async cancelOrder(req: Request, res: Response) {

        const uid = await this.users.verifyUser(req.cookies.tradeBiscuit);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        const orderingUser = this.users.getUserByID(uid);

        if (typeof orderingUser === "undefined")
            return res.status(401).send("401: user not found");

        if (typeof orderingUser.portfolio === "undefined")
            return res.status(400).send("400: user has no portfolio");


        const order = this.market.getOrderByID(req.params.stock, req.params.orderid);
        if (typeof order === "undefined")
            return res.status(400).send("400: order already canceled or incorrect order details provided");


        //Check order ownership
        if (order.cuid !== orderingUser.usid)
            return res.status(400).send("400: order not owned by canceling user");

        //Settle resources
        const stockReturned = (order.type === orderType.BUY ? "cash" : req.params.stock);
        const amountReturned = (order.type === orderType.BUY ? order.totalPrice : order.units);

        //Delete order
        if (!this.market.removeOrder(req.params.stock, order))
            return res.status(400).send("400: error deleting order");


        //Update User's portfolio
        if (stockReturned === "cash")
            orderingUser.portfolio.cash += amountReturned;
        else {
            if (typeof orderingUser.portfolio.assets[stockReturned] === "undefined")
                orderingUser.portfolio.assets[stockReturned] = 0;
            
            orderingUser.portfolio.assets[stockReturned] += amountReturned;
        }

        //Issue payment to cancelling party
        if (typeof orderingUser.ws !== "undefined") //if there is no websocket we don't care - user is disconnectet and will get the update with connection sync
            orderingUser.ws.send(JSON.stringify({
                type: "payment",
                content: {
                    stock: stockReturned,
                    amount: amountReturned
                }
            }));

        //Anounce order cancelation
        this.websock.broadcastAll({
            stock: req.params.stock,
            cancel: req.params.orderid
        });

        return res.status(200).send("200: ok");
    }
 

    private market: Market;
    private users: Users;
    private websock: WSServer;
}
